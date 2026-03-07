# AI 笔记应用 — 测试用例清单

本文档列出全项目需要覆盖的测试场景，包括**自动化测试**（已有或待补充）与**手工测试 case**，便于验收与回归。

---

## 一、环境与配置

| 编号 | 场景 | 类型 | 步骤 / 预期 |
|------|------|------|-------------|
| E1 | 未配置 LLM API Key | 手工 | 不设置 `OPENAI_API_KEY` 等；点击「AI 处理」→ 前端收到 503 或错误 JSON → 展示友好提示，不白屏、不 crash |
| E2 | 配置 GML 模型 | 手工 | `.env.local` 设置 `LLM_PROVIDER=gml`、`GML_API_KEY=<你的 key>`；重启 dev；在详情页「AI 处理」→ 流式输出正常（智谱 GLM） |
| E3 | 配置 OpenAI / DeepSeek | 手工 | 分别设置 `LLM_PROVIDER=openai` 或 `deepseek` 及对应 Key → AI 处理均能流式返回 |
| E4 | env 读取与 getEnv 形状 | 自动化 | 已有 `lib/env.test.ts`：未设置时 getters 为 undefined；getEnv() 包含 llmProvider、openaiKey、deepSeekKey、groqKey、gmlKey |

---

## 二、笔记 CRUD（API + 前端）

| 编号 | 场景 | 类型 | 步骤 / 预期 |
|------|------|------|-------------|
| N1 | 创建笔记 | 手工 | 列表页「新建笔记」→ 跳转详情页；GET /api/notes 包含新笔记；刷新列表仍存在 |
| N2 | 编辑标题 | 手工 | 详情页改标题，失焦或防抖后 → PUT /api/notes/[id] 成功；列表页标题更新 |
| N3 | 编辑内容 | 手工 | 详情页改正文，失焦或防抖后 → PUT 成功；刷新后内容保留 |
| N4 | 删除笔记 | 手工 | 详情页「删除笔记」→ 跳转列表；该笔记消失；GET /api/notes/[id] 返回 404 |
| N5 | 列表拉取 | 手工 | 打开列表页 → GET /api/notes 返回 200 与 JSON 数组；Zustand store 与 UI 一致 |
| N6 | 详情 404 | 手工 | 访问 /note/不存在的id → 重定向列表或展示「无效的笔记地址」 |

---

## 三、AI 处理（流式 + 接受/丢弃）

| 编号 | 场景 | 类型 | 步骤 / 预期 |
|------|------|------|-------------|
| A1 | 全文处理 | 手工 | 详情页不选中文字，点「AI 处理」→ 弹出悬浮框；流式逐字显示；原笔记不改动 |
| A2 | 选中处理 | 手工 | 选中一段文字后点「AI 处理」→ 仅将选中内容发给 API；悬浮框流式显示结果 |
| A3 | 接受（全文） | 手工 | 无选中时点「接受」→ 整篇笔记被 AI 结果替换；PUT 更新；Modal 关闭 |
| A4 | 接受（选中） | 手工 | 有选中时点「接受」→ 仅选中部分被替换，其余保留；PUT 更新；Modal 关闭 |
| A5 | 丢弃 | 手工 | 流式过程中或结束后点「丢弃」→ Modal 关闭；原笔记内容不变 |
| A6 | 流式解析 SSE | 自动化 | 已有 `__tests__/lib/stream-utils.test.ts`：解析 `data: {"content":"..."}`、[DONE]、纯文本等 |
| A7 | Modal 接受/丢弃回调 | 自动化 | 已有 `__tests__/components/AiResultModal.test.tsx`：mock stream → 接受调用 onAccept(全文)、丢弃调用 onDiscard |

---

## 四、Firestore 实时同步（可选）

| 编号 | 场景 | 类型 | 步骤 / 预期 |
|------|------|------|-------------|
| F1 | 无 Firebase 配置 | 手工 | 不配置 `NEXT_PUBLIC_FIREBASE_*` → 应用正常；仅用 SQLite/API，无报错 |
| F2 | 有 Firebase 配置 | 手工 | 配置后打开列表页 → 若 Firestore 中有 notes 集合，onSnapshot 更新 store；多标签或多端修改 Firestore 后本端列表/详情能更新（若已实现双写） |

---

## 五、长文流式与性能

| 编号 | 场景 | 类型 | 步骤 / 预期 |
|------|------|------|-------------|
| P1 | 长文流式不卡顿 | 手工 | 触发一次较长 AI 输出（或 mock 万行）→ 悬浮框内滚动与逐字显示流畅；无长时间卡顿、掉帧 |
| P2 | 虚拟滚动 | 手工 | 流式内容超过约 500 行后 → 使用虚拟列表；滚动条与可见区域渲染正常 |

---

## 六、响应式与基础体验

| 编号 | 场景 | 类型 | 步骤 / 预期 |
|------|------|------|-------------|
| R1 | 桌面端 | 手工 | 桌面浏览器打开列表/详情 → 布局正常；按钮、链接、输入框可操作 |
| R2 | 移动端 375–420px | 手工 | 窄屏或 DevTools 模拟 375px/420px → 布局适配；列表、详情、Modal 可用 |
| R3 | 无白屏/crash | 手工 | 正常操作路径下无白屏、未捕获异常；API 错误时前端有提示而非崩溃 |

---

## 七、部署与交付

| 编号 | 场景 | 类型 | 步骤 / 预期 |
|------|------|------|-------------|
| D1 | 本地运行 | 手工 | 克隆仓库 → `cp .env.local.example .env.local` 并填写 Key → `npm i && npm run dev` → 可访问列表/详情/AI 处理 |
| D2 | 构建 | 手工 | `npm run build` 成功（网络问题导致 font 失败可忽略）；`npm run test:run` 全部通过 |
| D3 | Vercel 部署 | 手工 | 连接仓库，配置 LLM_PROVIDER、GML_API_KEY 等环境变量 → 部署成功；可访问链接可打开应用 |

---

## 八、自动化测试汇总（当前已有）

| 文件 | 覆盖 |
|------|------|
| `lib/env.test.ts` | getLLMProvider、各 Key getter、getEnv() 形状（含 gmlKey） |
| `__tests__/lib/stream-utils.test.ts` | SSE 解析、[DONE]、纯文本、异常 JSON |
| `__tests__/components/AiResultModal.test.tsx` | stream=null 不渲染、接受传递全文、丢弃调用 onDiscard |

运行：`npm run test:run`。

---

## 九、建议补充的自动化用例（可选）

- **API 路由**：`app/api/notes/route.ts` 与 `app/api/notes/[id]/route.ts` 的 GET/POST/PUT/DELETE 状态码与 JSON 形状（需 mock SQLite 或使用测试 DB）。
- **API AI 流**：POST /api/ai/stream 无 Key 时返回 503；body 缺 content 时返回 400。
- **GML provider**：对 `streamChatGml` 做单元测试（mock fetch，断言请求 URL/headers/body 与流式输出格式）。

---

## 使用方式

- **手工测试**：按上表逐条执行，结果填通过/不通过。
- **自动化**：每次改代码后跑 `npm run test:run`；新增 case 可写入 `__tests__/` 并在此文档「自动化测试汇总」中补充一行。
