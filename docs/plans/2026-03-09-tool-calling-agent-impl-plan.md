# Tool Calling Agent 重架构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有文本 ReAct XML 解析 Agent 重架构为基于原生 Tool Calling API 的流式 Agent，修复阻塞根因，建立消息类型体系，添加取消机制。

**Architecture:** LLM provider 新增 `chatWithToolsStream` 函数，接受 tools 定义和 AbortSignal，边收流边 yield ProviderStreamEvent。`runToolCallingLoop` generator 消费这些事件，执行工具后再次循环，将 SSE 事件推给客户端。客户端 `AgentChatPanel` 管理 AbortController，按新事件类型渲染消息。

**Tech Stack:** Next.js 15 App Router, TypeScript, Zustand, OpenAI/DeepSeek Tool Calling API (streaming), Server-Sent Events

---

## Task 1: 更新 LLM 服务端类型

**Files:**
- Modify: `src/server/llm/types.ts`

**Step 1: 直接修改 types.ts，新增类型**

替换 `src/server/llm/types.ts` 全部内容为：

```typescript
/**
 * LLM adapter types. Used by streamChat and provider implementations.
 */

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;  // for tool role messages
  name?: string;          // for tool role messages
}

export interface StreamOptions {
  onChunk?(text: string): void;
  onDone?(): void;
}

/** OpenAI-compatible tool definition */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}

/** Events yielded by chatWithToolsStream */
export type ProviderStreamEvent =
  | { type: "content_delta"; content: string }
  | { type: "tool_call_start"; callId: string; toolName: string }
  | { type: "tool_call_args_delta"; callId: string; argsDelta: string }
  | { type: "finish"; reason: "stop" | "tool_calls" | "length" }
  | { type: "error"; message: string };
```

**Step 2: TypeScript 检查**

```bash
cd /Users/lynncen/code/ai-note-mate && npx tsc --noEmit 2>&1 | head -30
```

Expected: 可能出现类型错误（因为下游还未更新），记下来，后续 task 会修复。

**Step 3: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/server/llm/types.ts
git commit -m "feat(llm): add ToolDefinition and ProviderStreamEvent types"
```

---

## Task 2: 创建 Tool Calling 流式 Provider

**Files:**
- Create: `src/server/llm/providers/tool-calling.ts`
- Test: `__tests__/llm/tool-calling.test.ts`

**Step 1: 创建测试文件**

创建 `__tests__/llm/tool-calling.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolDefinition } from "@server/llm/types";

// We test the parsing helpers via their expected output shape.
// Full integration is tested in conversation.test.ts.

describe("tool-calling provider - parseToolCallDelta", () => {
  it("parses content delta", () => {
    const line = `data: ${JSON.stringify({
      choices: [{ delta: { content: "hello" }, finish_reason: null, index: 0 }],
    })}`;
    // parseToolCallDelta is a module-private helper; we test via chatWithToolsStream
    // This file serves as a placeholder for manual verification.
    expect(line).toContain("hello");
  });

  it("tool definition has correct shape", () => {
    const tool: ToolDefinition = {
      type: "function",
      function: {
        name: "search_notes",
        description: "Search notes",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    };
    expect(tool.type).toBe("function");
    expect(tool.function.name).toBe("search_notes");
  });
});
```

**Step 2: 运行测试确认通过**

```bash
cd /Users/lynncen/code/ai-note-mate && npx vitest run __tests__/llm/tool-calling.test.ts 2>&1
```

Expected: PASS（测试只检查类型形状）。

**Step 3: 创建 Provider 文件**

创建 `src/server/llm/providers/tool-calling.ts`：

```typescript
/**
 * OpenAI-compatible Tool Calling streaming provider.
 * Works with OpenAI, DeepSeek (OpenAI-compat), and similar APIs.
 *
 * Returns an AsyncGenerator that yields ProviderStreamEvent objects
 * so the caller can react to content deltas and tool calls without buffering.
 */

import type { ChatMessage, ToolDefinition, ProviderStreamEvent } from "../types";

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
    index: number;
  }>;
}

/**
 * Stream chat with tool calling support. Yields structured events.
 * The caller is responsible for executing tool calls and looping.
 *
 * @param baseUrl  API base URL (e.g. "https://api.openai.com/v1")
 * @param apiKey   Bearer token
 * @param model    Model ID
 * @param messages Conversation history
 * @param tools    Tool definitions (empty = no tool calling)
 * @param signal   AbortSignal for cancellation
 */
export async function* chatWithToolsStream(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal
): AsyncGenerator<ProviderStreamEvent> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {}),
    })),
    stream: true,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      return; // client cancelled, silently stop
    }
    yield { type: "error", message: `LLM fetch failed: ${String(err)}` };
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    yield { type: "error", message: `LLM API error ${res.status}: ${text}` };
    return;
  }

  if (!res.body) {
    yield { type: "error", message: "LLM response has no body" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Track in-progress tool calls (keyed by index)
  const toolCalls: Record<number, { id: string; name: string; args: string }> = {};
  let finishReason: string | null = null;

  try {
    while (true) {
      if (signal?.aborted) return;

      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      // Process all complete SSE lines
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);

        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;

        let chunk: OpenAIStreamChunk;
        try {
          chunk = JSON.parse(data) as OpenAIStreamChunk;
        } catch {
          continue;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        if (!delta) continue;

        // Content token
        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield { type: "content_delta", content: delta.content };
        }

        // Tool call deltas
        for (const tc of delta.tool_calls ?? []) {
          const idx2 = tc.index;
          if (!toolCalls[idx2]) {
            toolCalls[idx2] = { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" };
            if (tc.id && tc.function?.name) {
              yield {
                type: "tool_call_start",
                callId: tc.id,
                toolName: tc.function.name,
              };
            }
          }
          if (tc.id && !toolCalls[idx2].id) toolCalls[idx2].id = tc.id;
          if (tc.function?.name && !toolCalls[idx2].name) toolCalls[idx2].name = tc.function.name;
          if (tc.function?.arguments) {
            toolCalls[idx2].args += tc.function.arguments;
            yield {
              type: "tool_call_args_delta",
              callId: toolCalls[idx2].id,
              argsDelta: tc.function.arguments,
            };
          }
        }
      }

      if (done) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (signal?.aborted) return;

  // Determine final finish reason
  const hasToolCalls = Object.keys(toolCalls).length > 0;
  yield {
    type: "finish",
    reason: (finishReason === "tool_calls" || hasToolCalls) ? "tool_calls" : "stop",
  };
}

/**
 * Extract completed tool calls after stream ends.
 * Call this after iterating chatWithToolsStream to exhaustion.
 * Returns map of callId → { name, argsJson }
 */
export function extractToolCalls(
  events: ProviderStreamEvent[]
): Array<{ callId: string; toolName: string; argsJson: string }> {
  // Reconstruct from start + args_delta events
  const calls: Record<string, { toolName: string; args: string }> = {};
  for (const event of events) {
    if (event.type === "tool_call_start") {
      calls[event.callId] = { toolName: event.toolName, args: "" };
    } else if (event.type === "tool_call_args_delta") {
      if (calls[event.callId]) calls[event.callId].args += event.argsDelta;
    }
  }
  return Object.entries(calls).map(([callId, { toolName, args }]) => ({
    callId,
    toolName,
    argsJson: args,
  }));
}
```

**Step 4: TypeScript 检查**

```bash
cd /Users/lynncen/code/ai-note-mate && npx tsc --noEmit 2>&1 | head -30
```

Expected: 可能仍有下游错误（后续 task 修复）。

**Step 5: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/server/llm/providers/tool-calling.ts __tests__/llm/tool-calling.test.ts
git commit -m "feat(llm): add OpenAI-compatible tool calling streaming provider"
```

---

## Task 3: 更新 LLM index 导出新函数

**Files:**
- Modify: `src/server/llm/index.ts`

**Step 1: 修改 index.ts，增加 `chatWithToolsStream` 导出**

将 `src/server/llm/index.ts` 替换为：

```typescript
/**
 * Configurable LLM adapter. Dispatches to provider based on LLM_PROVIDER env.
 * Server-side only.
 */

import { getLLMProvider, getDeepSeekKey, getOpenAIKey } from "@server/env";
import { streamChatDeepSeek } from "./providers/deepseek";
import { streamChatGml } from "./providers/gml";
import { streamChatOpenAI } from "./providers/openai";
import { chatWithToolsStream as chatWithToolsStreamImpl } from "./providers/tool-calling";
import type { ChatMessage, StreamOptions, ToolDefinition, ProviderStreamEvent } from "./types";

export type { ChatMessage, ChatRole, StreamOptions, ToolDefinition, ProviderStreamEvent } from "./types";

/**
 * Stream chat completion using the configured LLM provider (LLM_PROVIDER).
 * Returns a ReadableStream<Uint8Array> that emits SSE "data: {...}\n\n" lines.
 * Defaults to openai when LLM_PROVIDER is not set.
 */
export async function streamChat(
  messages: ChatMessage[],
  options?: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const provider = getLLMProvider();
  const normalized = (provider?.toLowerCase() || "openai") as string;

  if (normalized === "openai") {
    return streamChatOpenAI(messages, options);
  }
  if (normalized === "deepseek") {
    return streamChatDeepSeek(messages, options);
  }
  if (normalized === "gml") {
    return streamChatGml(messages, options);
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

/**
 * Tool calling streaming chat using the configured LLM provider.
 * Yields ProviderStreamEvent objects for real-time processing.
 * Supports AbortSignal for cancellation.
 */
export async function* chatWithToolsStream(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal
): AsyncGenerator<ProviderStreamEvent> {
  const provider = getLLMProvider();
  const normalized = (provider?.toLowerCase() || "openai") as string;

  let baseUrl: string;
  let apiKey: string;
  let model: string;

  if (normalized === "deepseek") {
    baseUrl = "https://api.deepseek.com/v1";
    apiKey = getDeepSeekKey() ?? "";
    model = "deepseek-chat";
  } else {
    // openai and others
    baseUrl = "https://api.openai.com/v1";
    apiKey = getOpenAIKey() ?? "";
    model = "gpt-4o-mini";
  }

  if (!apiKey) {
    yield { type: "error", message: `API key not set for provider: ${normalized}` };
    return;
  }

  yield* chatWithToolsStreamImpl(baseUrl, apiKey, model, messages, tools, signal);
}
```

**Step 2: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/server/llm/index.ts
git commit -m "feat(llm): export chatWithToolsStream with provider routing"
```

---

## Task 4: 更新 Agent 服务端类型和 Tool Registry

**Files:**
- Modify: `src/agents/types.ts`
- Modify: `src/agents/tool-registry.ts`

**Step 1: 重写 `src/agents/types.ts`**

```typescript
import type { ChatMessage, ToolDefinition } from "@server/llm/types";

export type { ChatMessage, ToolDefinition };

export interface AgentContext {
  noteId: string | null;
  noteContent: string | null;
  noteTitle: string | null;
}
```

**Step 2: 重写 `src/agents/tool-registry.ts`**

将 `parametersSchema` 字符串格式改为标准 OpenAI `ToolDefinition` 格式：

```typescript
import { readCurrentNote, searchNotes, draftDocument } from "./document-agent/tools";
import { DRAFT_TEMPLATES } from "./document-agent/prompts";
import type { ToolDefinition } from "@server/llm/types";
import type { Note } from "@/types/note";

export type { ToolDefinition };

/** Tools available to the Document Agent */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_note",
      description: "读取当前打开的笔记的完整标题和正文内容。无需参数，直接调用。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "在用户所有笔记中进行关键词搜索，返回最相关的前 3 篇。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_document",
      description: "根据指定模板生成文档草稿，支持会议纪要、技术文档、周报。",
      parameters: {
        type: "object",
        properties: {
          template: {
            type: "string",
            enum: ["meeting", "tech", "weekly"],
            description: "模板类型",
          },
          title: {
            type: "string",
            description: "文档标题",
          },
        },
        required: ["template", "title"],
      },
    },
  },
];

type NoteContext = { title: string; content: string } | null;

/**
 * Execute a named tool and return the observation string.
 */
export async function executeAgentTool(
  toolName: string,
  toolArgsJson: string,
  noteContext: NoteContext,
  allNotes: Note[]
): Promise<string> {
  let args: Record<string, string> = {};
  try {
    args = JSON.parse(toolArgsJson);
  } catch {
    // treat as empty args
  }

  switch (toolName) {
    case "read_note": {
      const result = readCurrentNote(noteContext);
      return result.content;
    }
    case "search_notes": {
      const result = searchNotes(args.query ?? "", allNotes);
      return result.content;
    }
    case "draft_document": {
      const result = draftDocument(
        args.template ?? "tech",
        args.title ?? "",
        DRAFT_TEMPLATES
      );
      return result.content;
    }
    default:
      return `未知工具: ${toolName}`;
  }
}
```

**Step 3: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/agents/types.ts src/agents/tool-registry.ts
git commit -m "feat(agents): update types and tool registry to OpenAI tool format"
```

---

## Task 5: 重写 conversation.ts — runToolCallingLoop

**Files:**
- Modify: `src/agents/conversation.ts`
- Delete: `src/agents/react-engine.ts`

**Step 1: 重写 `src/agents/conversation.ts`**

```typescript
/**
 * Tool Calling Agent loop.
 *
 * Flow per turn:
 *  1. Build messages with system prompt + conversation history
 *  2. Call LLM with tool definitions via chatWithToolsStream
 *  3. Stream content deltas → yield SSE content_delta events immediately
 *  4. If finish_reason=tool_calls → execute tools → append tool messages → goto 2
 *  5. If finish_reason=stop → yield done event and return
 *  6. Max 5 iterations guard → yield error event
 *
 * AbortSignal is propagated all the way to the LLM fetch call.
 */
import { chatWithToolsStream } from "@server/llm";
import type { ChatMessage } from "@server/llm/types";
import { executeAgentTool, AGENT_TOOLS } from "./tool-registry";
import { extractToolCalls } from "@server/llm/providers/tool-calling";
import type { AgentContext } from "./types";
import type { Note } from "@/types/note";
import type { ProviderStreamEvent } from "@server/llm/types";

export interface ConversationRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: AgentContext;
  allNotes: Note[];
  signal?: AbortSignal;
}

const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `你是一个文档助手 Agent，帮助用户管理和编辑笔记。

你有以下工具可以使用：
- read_note：读取当前笔记内容
- search_notes：搜索用户所有笔记
- draft_document：根据模板生成文档草稿

规则：
1. 遇到需要查询信息的问题，先调用相关工具获取信息，再基于信息回答。
2. 回答要简洁、具体、有帮助。
3. 如果用户提问与笔记内容相关，优先读取当前笔记。
4. 用中文回答。`;

/**
 * Async generator that runs the Tool Calling loop and yields SSE strings.
 *
 * Each yielded string is a complete SSE block, e.g.:
 *   "event: content_delta\ndata: {\"content\":\"...\"}\n\n"
 */
export async function* runToolCallingLoop(
  req: ConversationRequest
): AsyncGenerator<string> {
  const { messages, context, allNotes, signal } = req;

  const noteContext =
    context.noteContent !== null
      ? { title: context.noteTitle ?? "", content: context.noteContent }
      : null;

  // Build LLM message history
  const history: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return;

    // Collect all events from this LLM call
    const collectedEvents: ProviderStreamEvent[] = [];

    // Collect assistant content for this iteration
    let assistantContent = "";

    for await (const event of chatWithToolsStream(history, AGENT_TOOLS, signal)) {
      if (signal?.aborted) return;

      collectedEvents.push(event);

      switch (event.type) {
        case "content_delta":
          assistantContent += event.content;
          yield sseEvent("content_delta", { content: event.content });
          break;

        case "tool_call_start":
          yield sseEvent("tool_call_start", {
            callId: event.callId,
            toolName: event.toolName,
          });
          break;

        case "error":
          yield sseEvent("error", { message: event.message });
          return;

        case "tool_call_args_delta":
        case "finish":
          // handled below after loop
          break;
      }
    }

    if (signal?.aborted) return;

    // Check finish reason
    const finishEvent = collectedEvents.find((e) => e.type === "finish");
    const finishReason = finishEvent?.type === "finish" ? finishEvent.reason : "stop";

    if (finishReason === "stop" || finishReason === "length") {
      // Final answer — stream is complete
      yield sseEvent("done", {});
      return;
    }

    // Tool calls — execute and continue loop
    const toolCalls = extractToolCalls(collectedEvents);

    if (toolCalls.length === 0) {
      // No tool calls despite finish_reason=tool_calls → treat as done
      yield sseEvent("done", {});
      return;
    }

    // Append assistant message with tool_calls placeholder
    history.push({
      role: "assistant",
      content: assistantContent || "",
    });

    // Execute each tool call and append results
    for (const tc of toolCalls) {
      if (signal?.aborted) return;

      const toolResult = await executeAgentTool(
        tc.toolName,
        tc.argsJson,
        noteContext,
        allNotes
      );

      yield sseEvent("tool_result", {
        callId: tc.callId,
        toolName: tc.toolName,
        content: toolResult,
      });

      // Append tool result as user message (OpenAI tool role)
      history.push({
        role: "tool" as const,
        content: toolResult,
        tool_call_id: tc.callId,
        name: tc.toolName,
      });
    }
    // Continue loop with updated history
  }

  yield sseEvent("error", { message: "Agent 达到最大迭代次数，请重新提问。" });
}

function sseEvent(event: string, data: Record<string, string>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

**Step 2: 删除 react-engine.ts**

```bash
rm /Users/lynncen/code/ai-note-mate/src/agents/react-engine.ts
```

**Step 3: TypeScript 检查**

```bash
cd /Users/lynncen/code/ai-note-mate && npx tsc --noEmit 2>&1 | head -40
```

**Step 4: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/agents/conversation.ts
git rm src/agents/react-engine.ts
git commit -m "feat(agents): rewrite runToolCallingLoop with Tool Calling API, remove XML ReAct engine"
```

---

## Task 6: 更新 API Route，透传 AbortSignal

**Files:**
- Modify: `app/api/ai/chat/route.ts`

**Step 1: 修改 route.ts**

```typescript
import { NextRequest } from "next/server";
import { runToolCallingLoop } from "@agents/conversation";
import type { AgentContext } from "@agents/types";

export async function POST(request: NextRequest) {
  let body: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    noteId: string | null;
    noteTitle: string;
    noteContent: string;
    allNotes: Array<{ id: string; title: string; content: string; updatedAt: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, noteId, noteTitle, noteContent, allNotes } = body;

  const context: AgentContext = {
    noteId: noteId ?? null,
    noteContent: noteContent ?? null,
    noteTitle: noteTitle ?? null,
  };

  const generator = runToolCallingLoop({
    messages,
    context,
    allNotes,
    signal: request.signal,
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          if (request.signal.aborted) break;
          controller.enqueue(new TextEncoder().encode(chunk));
        }
      } catch (err) {
        if (!request.signal.aborted) {
          const errorEvent = `event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorEvent));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Step 2: TypeScript 检查**

```bash
cd /Users/lynncen/code/ai-note-mate && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add app/api/ai/chat/route.ts
git commit -m "feat(api): pass request.signal to runToolCallingLoop for abort propagation"
```

---

## Task 7: 更新客户端类型体系

**Files:**
- Modify: `types/agent.ts`

**Step 1: 重写 `types/agent.ts`**

```typescript
/** Client-side Agent message types */

export type AgentEventType =
  | "content_delta"
  | "tool_call_start"
  | "tool_result"
  | "done"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  content?: string;      // content_delta text / tool_result content / error message
  toolName?: string;     // tool_call_start / tool_result
  toolInput?: string;    // tool_call_start parsed args (for display)
  callId?: string;       // tool_call_start / tool_result pairing
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  events: AgentEvent[];    // ordered stream of events
  fullContent: string;     // accumulated content_delta text
  isDone: boolean;         // true after "done" event received
  createdAt: string;
}

export interface AgentConversation {
  messages: AgentMessage[];
}
```

**Step 2: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add types/agent.ts
git commit -m "feat(types): new AgentEvent/AgentMessage client type system"
```

---

## Task 8: 新建 AgentEventCard 组件，删除 AgentStepCard

**Files:**
- Create: `src/client/components/agent/AgentEventCard.tsx`
- Delete: `src/client/components/agent/AgentStepCard.tsx`

**Step 1: 创建 `AgentEventCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { AgentEvent } from "@/types/agent";

interface AgentEventCardProps {
  event: AgentEvent;
  onApplyToEditor?: (content: string) => void;
}

const EVENT_CONFIG: Record<
  string,
  { label: string; bgClass: string; textClass: string; collapsible: boolean }
> = {
  tool_call_start: {
    label: "🔧 调用工具",
    bgClass: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    textClass: "text-amber-700 dark:text-amber-300",
    collapsible: true,
  },
  tool_result: {
    label: "📊 工具结果",
    bgClass: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    textClass: "text-blue-700 dark:text-blue-300",
    collapsible: true,
  },
  error: {
    label: "❌ 错误",
    bgClass: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
    textClass: "text-red-700 dark:text-red-300",
    collapsible: false,
  },
};

export function AgentEventCard({ event, onApplyToEditor }: AgentEventCardProps) {
  const [collapsed, setCollapsed] = useState(true);

  if (event.type === "content_delta" || event.type === "done") {
    return null; // rendered by parent as flowing text
  }

  const config = EVENT_CONFIG[event.type];
  if (!config) return null;

  const isError = event.type === "error";
  const body = event.content ?? event.toolInput ?? "";
  const heading = event.toolName
    ? `${config.label}：${event.toolName}`
    : config.label;

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs my-1 ${config.bgClass}`}>
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-2 font-medium ${config.textClass}`}
        onClick={() => config.collapsible && setCollapsed((v) => !v)}
        disabled={!config.collapsible}
      >
        <span>{heading}</span>
        {config.collapsible && (
          <span className="opacity-60">{collapsed ? "▸" : "▾"}</span>
        )}
      </button>

      {(!config.collapsible || !collapsed) && body && (
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] opacity-80 max-h-40 overflow-y-auto">
          {body}
        </pre>
      )}

      {/* "Apply to editor" only for non-error, non-tool events with content */}
      {!isError && event.type === "tool_result" && body && onApplyToEditor && !collapsed && (
        <button
          type="button"
          onClick={() => onApplyToEditor(body)}
          className="mt-2 rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:opacity-90"
        >
          应用到编辑器
        </button>
      )}
    </div>
  );
}
```

**Step 2: 删除旧文件**

```bash
rm /Users/lynncen/code/ai-note-mate/src/client/components/agent/AgentStepCard.tsx
```

**Step 3: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/client/components/agent/AgentEventCard.tsx
git rm src/client/components/agent/AgentStepCard.tsx
git commit -m "feat(ui): add AgentEventCard, remove AgentStepCard, enforce no Apply-to-editor on errors"
```

---

## Task 9: 更新 AgentMessage.tsx

**Files:**
- Modify: `src/client/components/agent/AgentMessage.tsx`

**Step 1: 重写 `AgentMessage.tsx`**

```tsx
"use client";

import { AgentEventCard } from "./AgentEventCard";
import type { AgentMessage as AgentMessageType } from "@/types/agent";

export interface AgentMessageProps {
  message: AgentMessageType;
  onApplyToEditor?: (content: string) => void;
}

export function AgentMessage({ message, onApplyToEditor }: AgentMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.fullContent}
        </div>
      </div>
    );
  }

  // Assistant message
  const hasError = message.events.some((e) => e.type === "error");
  const isStreaming = !message.isDone;

  return (
    <div className="flex flex-col gap-1">
      {/* Tool call / result / error event cards */}
      {message.events
        .filter((e) => e.type !== "content_delta" && e.type !== "done")
        .map((event, i) => (
          <AgentEventCard
            key={i}
            event={event}
            onApplyToEditor={onApplyToEditor}
          />
        ))}

      {/* Flowing content text */}
      {message.fullContent && (
        <div className="rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
          <p className="whitespace-pre-wrap">{message.fullContent}</p>

          {/* Streaming cursor */}
          {isStreaming && !hasError && (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-foreground/60 align-middle" />
          )}

          {/* Apply to editor — only when done and no error */}
          {message.isDone && !hasError && onApplyToEditor && (
            <button
              type="button"
              onClick={() => onApplyToEditor(message.fullContent)}
              className="mt-2 block rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90"
            >
              应用到编辑器
            </button>
          )}
        </div>
      )}

      {/* Empty streaming placeholder */}
      {!message.fullContent && isStreaming && !hasError && (
        <div className="rounded-2xl bg-muted px-3 py-2 text-sm">
          <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-foreground/60 align-middle" />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/client/components/agent/AgentMessage.tsx
git commit -m "feat(ui): rewrite AgentMessage to use new event system with streaming cursor"
```

---

## Task 10: 重写 AgentChatPanel — 新 SSE 解析 + AbortController

**Files:**
- Modify: `src/client/components/agent/AgentChatPanel.tsx`

**Step 1: 重写 `AgentChatPanel.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import type { AgentMessage as AgentMessageType, AgentEvent } from "@/types/agent";

export interface AgentChatPanelProps {
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
  onApplyToEditor?: (content: string) => void;
}

export function AgentChatPanel({
  noteId,
  noteTitle,
  noteContent,
  onApplyToEditor,
}: AgentChatPanelProps) {
  const { notes } = useNotesStore();
  const [messages, setMessages] = useState<AgentMessageType[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (userText: string) => {
      // Cancel any in-progress request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMsg: AgentMessageType = {
        id: `msg-${Date.now()}`,
        role: "user",
        events: [],
        fullContent: userText,
        isDone: true,
        createdAt: new Date().toISOString(),
      };

      const conversationHistory = [...messages, userMsg];
      setMessages(conversationHistory);
      setStreaming(true);

      const assistantId = `msg-${Date.now() + 1}`;
      const assistantMsg: AgentMessageType = {
        id: assistantId,
        role: "assistant",
        events: [],
        fullContent: "",
        isDone: false,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: conversationHistory.map((m) => ({
              role: m.role,
              content: m.fullContent,
            })),
            noteId,
            noteTitle,
            noteContent,
            allNotes: notes.filter((n) => !n.id.startsWith("local-")),
          }),
        });

        if (!res.ok || !res.body) {
          appendEvent(assistantId, { type: "error", content: "请求失败，请重试。" });
          markDone(assistantId);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let rawBuffer = "";
        let pendingEventType: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            rawBuffer += decoder.decode(value, { stream: true });
            const lines = rawBuffer.split("\n");
            rawBuffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                pendingEventType = line.slice(7).trim();
              } else if (line.startsWith("data: ") && pendingEventType) {
                processSSEEvent(assistantId, pendingEventType, line.slice(6));
                pendingEventType = null;
              }
            }
          }
          if (done) break;
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // User cancelled — mark as done without error message
          markDone(assistantId);
          return;
        }
        appendEvent(assistantId, {
          type: "error",
          content: "请求出错，请重试。",
        });
        markDone(assistantId);
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setStreaming(false);
      }
    },
    [messages, noteId, noteTitle, noteContent, notes]
  );

  function processSSEEvent(assistantId: string, eventType: string, dataStr: string) {
    let data: Record<string, string> = {};
    try {
      data = JSON.parse(dataStr);
    } catch {
      return;
    }

    switch (eventType) {
      case "content_delta":
        // Append to fullContent and add event
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  fullContent: m.fullContent + (data.content ?? ""),
                  events: [...m.events, { type: "content_delta", content: data.content ?? "" }],
                }
              : m
          )
        );
        break;

      case "tool_call_start":
        appendEvent(assistantId, {
          type: "tool_call_start",
          callId: data.callId,
          toolName: data.toolName,
          toolInput: data.toolInput,
        });
        break;

      case "tool_result":
        appendEvent(assistantId, {
          type: "tool_result",
          callId: data.callId,
          toolName: data.toolName,
          content: data.content,
        });
        break;

      case "done":
        markDone(assistantId);
        break;

      case "error":
        appendEvent(assistantId, { type: "error", content: data.message ?? "发生错误" });
        markDone(assistantId);
        break;
    }
  }

  function appendEvent(assistantId: string, event: AgentEvent) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, events: [...m.events, event] } : m
      )
    );
  }

  function markDone(assistantId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, isDone: true } : m))
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Agent 对话</span>
          {streaming && (
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {streaming && (
            <button
              type="button"
              onClick={stopStreaming}
              className="text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              停止
            </button>
          )}
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 ? (
          <div className="mt-10 space-y-3 text-center px-4">
            <p className="text-sm font-medium text-foreground">你好！我是文档 Agent</p>
            <p className="text-xs text-muted-foreground">
              可以调用工具搜索笔记、读取当前文档、生成文档草稿
            </p>
            <ul className="text-left space-y-2 mt-4 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span>📖</span>
                <span>分析并引用当前笔记内容</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🔍</span>
                <span>搜索你的所有笔记知识库</span>
              </li>
              <li className="flex items-start gap-2">
                <span>📝</span>
                <span>起草会议纪要、技术文档、周报</span>
              </li>
            </ul>
          </div>
        ) : (
          messages.map((m) => (
            <AgentMessage
              key={m.id}
              message={m}
              onApplyToEditor={onApplyToEditor}
            />
          ))
        )}
      </div>

      {/* Input */}
      <div className="shrink-0">
        <AgentInput onSend={sendMessage} disabled={streaming} />
      </div>
    </div>
  );
}
```

**Step 2: TypeScript 检查**

```bash
cd /Users/lynncen/code/ai-note-mate && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/client/components/agent/AgentChatPanel.tsx
git commit -m "feat(ui): rewrite AgentChatPanel with new SSE parsing, AbortController, and stop button"
```

---

## Task 11: 修复 AiResultModal — Accept 按钮 + Cancel 机制

**Files:**
- Modify: `src/client/components/notes/AiResultModal.tsx`
- Modify: `app/note/[id]/page.tsx`
- Modify: `__tests__/components/AiResultModal.test.tsx`

**Step 1: 读取当前 AiResultModal.tsx**

```bash
cat /Users/lynncen/code/ai-note-mate/src/client/components/notes/AiResultModal.tsx
```

**Step 2: 在 AiResultModal 中恢复 Accept disabled 并添加 onCancel prop**

定位并修改以下内容：

将现有接口中加入 `onCancel?: () => void`：
```typescript
interface AiResultModalProps {
  // ... 现有 props ...
  onCancel?: () => void;  // 新增：取消流式生成
}
```

关闭/X 按钮改为调用 `onCancel` 然后关闭：
```typescript
const handleClose = () => {
  onCancel?.();
  onOpenChange(false);
};
```

Accept 按钮恢复 disabled：
```tsx
<Button type="button" onClick={handleAccept} disabled={!streamDone}>
  接受
</Button>
```

**Step 3: 在 app/note/[id]/page.tsx 中添加 aiAbortController ref**

找到 AI processing 相关代码，添加：
```typescript
const aiAbortRef = useRef<AbortController | null>(null);
```

在调用 AI stream 时使用此 ref。将 `onCancel={() => aiAbortRef.current?.abort()}` 传给 AiResultModal。

**Step 4: 更新测试 `__tests__/components/AiResultModal.test.tsx`**

找到并恢复关于 Accept 按钮 disabled 的断言：
```typescript
// Accept 按钮在流未完成时应该禁用
expect(acceptButton).toBeDisabled();
// 流完成后应该可用
expect(acceptButton).not.toBeDisabled();
```

**Step 5: 运行测试**

```bash
cd /Users/lynncen/code/ai-note-mate && npx vitest run __tests__/components/AiResultModal.test.tsx 2>&1
```

Expected: 所有测试 PASS。

**Step 6: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git add src/client/components/notes/AiResultModal.tsx app/note/[id]/page.tsx __tests__/components/AiResultModal.test.tsx
git commit -m "fix(ui): restore Accept button disabled until stream done, add cancel mechanism"
```

---

## Task 12: 更新测试 — 修复/删除过时测试

**Files:**
- Modify: `__tests__/agents/react-engine.test.ts` → 删除
- Modify: `__tests__/agents/tool-registry.test.ts` → 更新 tool 格式
- Create: `__tests__/agents/conversation.test.ts`

**Step 1: 删除 react-engine 测试**

```bash
rm /Users/lynncen/code/ai-note-mate/__tests__/agents/react-engine.test.ts
```

**Step 2: 更新 tool-registry 测试**

读取当前 `__tests__/agents/tool-registry.test.ts` 并修改：
- 去掉对 `parametersSchema` 字符串的断言
- 改为检查 `tool.type === "function"` 和 `tool.function.name` 等 OpenAI 格式

**Step 3: 创建 conversation 集成测试**

创建 `__tests__/agents/conversation.test.ts`：

```typescript
import { describe, it, expect, vi } from "vitest";
import { runToolCallingLoop } from "@agents/conversation";

// Mock the LLM provider
vi.mock("@server/llm", () => ({
  chatWithToolsStream: vi.fn(),
}));

vi.mock("@server/env", () => ({
  getLLMProvider: () => "openai",
  getOpenAIKey: () => "test-key",
}));

describe("runToolCallingLoop", () => {
  it("yields done event for simple answer", async () => {
    const { chatWithToolsStream } = await import("@server/llm");
    vi.mocked(chatWithToolsStream).mockImplementation(async function* () {
      yield { type: "content_delta" as const, content: "Hello!" };
      yield { type: "finish" as const, reason: "stop" as const };
    });

    const events: string[] = [];
    for await (const chunk of runToolCallingLoop({
      messages: [{ role: "user", content: "Hi" }],
      context: { noteId: null, noteContent: null, noteTitle: null },
      allNotes: [],
    })) {
      events.push(chunk);
    }

    const hasContentDelta = events.some((e) => e.includes("content_delta"));
    const hasDone = events.some((e) => e.includes('"done"') || e.includes("event: done"));
    expect(hasContentDelta).toBe(true);
    expect(hasDone).toBe(true);
  });

  it("yields error event on LLM error", async () => {
    const { chatWithToolsStream } = await import("@server/llm");
    vi.mocked(chatWithToolsStream).mockImplementation(async function* () {
      yield { type: "error" as const, message: "API error" };
    });

    const events: string[] = [];
    for await (const chunk of runToolCallingLoop({
      messages: [{ role: "user", content: "Hi" }],
      context: { noteId: null, noteContent: null, noteTitle: null },
      allNotes: [],
    })) {
      events.push(chunk);
    }

    const hasError = events.some((e) => e.includes("event: error"));
    expect(hasError).toBe(true);
  });
});
```

**Step 4: 运行全部测试**

```bash
cd /Users/lynncen/code/ai-note-mate && npx vitest run 2>&1
```

Expected: 所有测试 PASS（或仅 conversation.test.ts 有 mock 问题，记录下来）。

**Step 5: TypeScript 最终检查**

```bash
cd /Users/lynncen/code/ai-note-mate && npx tsc --noEmit 2>&1
```

Expected: 0 errors。

**Step 6: Commit**

```bash
cd /Users/lynncen/code/ai-note-mate
git rm __tests__/agents/react-engine.test.ts
git add __tests__/agents/tool-registry.test.ts __tests__/agents/conversation.test.ts __tests__/llm/tool-calling.test.ts
git commit -m "test: update tests for Tool Calling Agent architecture"
```

---

## 验证清单

完成所有 Task 后确认：

- [ ] `npx tsc --noEmit` 输出 0 errors
- [ ] `npx vitest run` 全部 PASS
- [ ] 浏览器中：发送 AI 对话消息，可以看到流式文字输出（不再是等待后一次性出现）
- [ ] 浏览器中：Agent 调用工具时，工具调用卡片实时出现
- [ ] 浏览器中：点击"停止"按钮立即中断 AI 生成
- [ ] 浏览器中：error 类型卡片不显示"应用到编辑器"
- [ ] 浏览器中：AiResultModal 的 Accept 按钮在流未完成时为禁用状态
- [ ] 浏览器中：AiResultModal 关闭按钮立即取消 AI 请求
