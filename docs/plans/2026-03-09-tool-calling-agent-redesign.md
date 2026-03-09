# Tool Calling Agent 重架构设计文档

**日期：** 2026-03-09  
**背景：** 现有 ReAct XML 文本解析方案存在严重阻塞问题，消息类型体系缺失，无中断机制。

---

## 问题根因

### 阻塞根因链路

```
collectStreamText(stream)
  → reader.read()                    // 等待 LLM provider
    → provider.pull()                // 读取上游 fetch body
      → res.body.getReader().read()  // LLM API fetch 无超时，挂起
```

三个独立缺陷：
1. **LLM provider `fetch` 无 timeout / signal** — API 慢时永久挂起
2. **`collectStreamText` 完全缓冲** — 等整个 LLM 响应收完才向客户端发任何 SSE 事件
3. **取消信号不透传** — 客户端 AbortController 只中止浏览器 fetch，服务端 generator 继续运行并可能发起后续 LLM 调用

### 消息体系缺失

- `AgentStep.type` 是字符串，`error` 类型的步骤卡片也显示"应用到编辑器"按钮
- 没有 `isDone` 标志，Accept 按钮在流未结束时就可点击

### 解析脆弱性

- 依赖 LLM 精确输出 `<Thought>/<Action>/<Answer>` XML，任何格式偏差都 fallback 成纯文本

---

## 新架构设计

### 核心：Tool Calling API 替代 XML ReAct

将 `runReActLoop` + `collectStreamText` + `parseReActResponse` 整体替换为基于 **OpenAI/DeepSeek 原生 Tool Calling API** 的 `runToolCallingLoop`：

```
Client                   Server                         LLM API
  |─ POST + AbortSignal ──► route.ts (request.signal)     |
  |                         │                              |
  |◄─ SSE: content_delta ───┤ runToolCallingLoop()         |
  |◄─ SSE: tool_call_start ─┤   ├─ chatWithToolsStream(messages, tools, signal)
  |◄─ SSE: tool_result ─────┤   │     └─ fetch with signal, yield deltas
  |◄─ SSE: content_delta ───┤   ├─ executeAgentTool()
  |◄─ SSE: done ────────────┤   └─ (loop until finish_reason="stop")
```

**关键改变：**
- content delta 边收边 yield，客户端立即看到流式文字
- tool_calls 在流式结束后执行（不阻塞 content streaming）
- `signal` 从 route → generator → provider fetch 三层穿透

---

## SSE 事件协议

服务端 → 客户端 SSE 格式：

```
event: content_delta
data: {"content": "根据你的笔记，"}

event: tool_call_start
data: {"callId": "call_abc", "toolName": "search_notes", "toolInput": "{\"query\":\"会议\"}"}

event: tool_result
data: {"callId": "call_abc", "toolName": "search_notes", "content": "找到 3 条相关笔记..."}

event: done
data: {}

event: error
data: {"message": "工具执行失败：..."}
```

---

## 消息类型体系

### 服务端内部类型（`src/agents/types.ts`）

```typescript
// LLM 流式事件（provider 输出）
type ProviderStreamEvent =
  | { type: "content_delta"; content: string }
  | { type: "tool_call_start"; callId: string; toolName: string }
  | { type: "tool_call_args_delta"; callId: string; argsDelta: string }
  | { type: "finish"; reason: "stop" | "tool_calls" }
  | { type: "error"; message: string }

// Tool Calling API 工具定义格式
interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
  };
}
```

### 客户端类型（`types/agent.ts`）

```typescript
type AgentEventType =
  | "content_delta"
  | "tool_call_start"
  | "tool_result"
  | "done"
  | "error"

interface AgentEvent {
  type: AgentEventType;
  content?: string;    // content_delta / tool_result / error message
  toolName?: string;   // tool_call_start / tool_result
  toolInput?: string;  // tool_call_start
  callId?: string;     // tool_call_start / tool_result（配对用）
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  events: AgentEvent[];    // 取代原来的 steps[]
  fullContent: string;     // content_delta 拼接结果
  isDone: boolean;         // done 事件到达后置 true
  createdAt: string;
}
```

---

## UI 渲染规则

| 事件类型 | 渲染 | 应用到编辑器 |
|---|---|---|
| `content_delta` 流中 | 流式文字 + 光标动画 | ❌ |
| `done` 后 `fullContent` | 完整答复卡片 | ✅ 仅此处显示 |
| `tool_call_start` | 工具调用卡片（可折叠，展示工具名+参数概要） | ❌ |
| `tool_result` | 观察结果卡片（可折叠） | ❌ |
| `error` | 红色错误卡片 | ❌ **明确禁止** |

---

## 中断机制

- `AgentChatPanel` 每次 `sendMessage` 创建一个新 `AbortController`，存入 `abortControllerRef`
- 新消息发送前自动 abort 旧的 controller
- Panel 卸载（`useEffect` cleanup）时 abort
- Mobile Agent 弹窗关闭时 abort
- 服务端：`app/api/ai/chat/route.ts` 将 `request.signal` 传入 generator
- LLM provider `fetch` 的 `signal` 参数穿透

---

## AiResultModal 流程修正

- Accept 按钮：`disabled` 直到 `streamDone === true`（恢复正确行为）
- "关闭/取消" 按钮：调用 `onCancel()` prop，触发外部 AbortController，立即关闭弹窗
- `app/note/[id]/page.tsx` 维护 `aiAbortController` ref，传给 AiResultModal

---

## 文件变更清单

### 新增/修改
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/server/llm/providers/tool-calling.ts` | **新增** | OpenAI 兼容 Tool Calling 流式实现，接受 signal |
| `src/server/llm/index.ts` | **修改** | 新增 `chatWithToolsStream(messages, tools, signal)` 导出 |
| `src/server/llm/types.ts` | **修改** | 新增 `ToolDefinition`, `ProviderStreamEvent` 类型 |
| `src/agents/types.ts` | **修改** | 替换 `ReActStep` 为新类型体系 |
| `src/agents/tool-registry.ts` | **修改** | `AGENT_TOOLS` 转为 `ToolDefinition[]` 格式 |
| `src/agents/conversation.ts` | **重写** | `runToolCallingLoop` 替换 `runReActLoop` |
| `app/api/ai/chat/route.ts` | **修改** | 传入 `request.signal` |
| `types/agent.ts` | **修改** | 新消息类型体系 |
| `src/client/components/agent/AgentChatPanel.tsx` | **修改** | 新 SSE 解析 + AbortController |
| `src/client/components/agent/AgentEventCard.tsx` | **新增** | 替换 AgentStepCard，按事件类型渲染 |
| `src/client/components/agent/AgentMessage.tsx` | **修改** | 使用 `AgentEventCard`，`isDone` 控制应用按钮 |
| `src/client/components/notes/AiResultModal.tsx` | **修改** | Accept disabled until done，onCancel prop |

### 删除
| 文件 | 说明 |
|---|---|
| `src/agents/react-engine.ts` | 不再需要 XML 解析 |
| `src/client/components/agent/AgentStepCard.tsx` | 替换为 AgentEventCard |

---

## 测试策略

- `__tests__/agents/tool-calling.test.ts`：`chatWithToolsStream` 单元测试（mock fetch）
- `__tests__/agents/conversation.test.ts`：`runToolCallingLoop` 集成测试（mock LLM + tools）
- `__tests__/components/AgentChatPanel.test.tsx`：AbortController 行为测试
- `__tests__/components/AiResultModal.test.tsx`：恢复 Accept 按钮 disabled 状态测试
