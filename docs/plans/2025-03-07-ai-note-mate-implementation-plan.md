# AI 笔记应用 全部实现 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 交付一个满足需求文档全部必做项与加分项的 Web 端 AI 笔记应用：Next.js 全栈 + Firestore 实时协作 + Tailwind + 可配置 LLM + 万行流式不卡顿 + 单元/组件测试 + 可访问链接。

**Architecture:** Next.js App Router 提供列表/详情页与 API Routes；Zustand 管理笔记状态；SQLite 作服务端持久化，Firebase Firestore 作实时同步（双写或主用 Firestore 二选一）；AI 经 Next API 代理，流式 SSE 回前端；悬浮框内流式区域用虚拟化/分片 + rAF 节流防卡顿；LLM 通过环境变量配置 provider + API Key，后端抽象适配多厂商。

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Zustand, SQLite (better-sqlite3), Firebase Firestore, Vitest, React Testing Library, Vercel.

---

## Phase 1：项目脚手架

### Task 1: 初始化 Next.js 项目（TypeScript + Tailwind）

**Files:**
- Create: 项目根目录由 `create-next-app` 生成
- Create: `tailwind.config.ts`, `postcss.config.mjs`, `next.config.ts`

**Step 1:** 创建 Next 项目（TypeScript, Tailwind, App Router, no src dir）

```bash
cd /Users/lynncen/code/ai-note-mate && npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

**Step 2:** 确认 `tailwind.config.ts` 存在且 content 包含 `./app/**/*.{ts,tsx}` 等

**Step 3:** 运行开发服务器验证

```bash
npm run dev
```
Expected: 本地可访问，无报错

**Step 4:** Commit

```bash
git add .
git commit -m "chore: init Next.js with TypeScript and Tailwind"
```

---

### Task 2: 安装并配置 Zustand、Firebase、SQLite、Vitest

**Files:**
- Modify: `package.json` (dependencies + test script)
- Create: `lib/env.ts`（读取 env 的封装，类型安全）

**Step 1:** 安装依赖

```bash
npm i zustand
npm i firebase
npm i better-sqlite3
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

**Step 2:** 在 `package.json` 的 `scripts` 中添加：

```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 3:** 创建 `lib/env.ts`，导出 `LLM_PROVIDER`, `OPENAI_API_KEY` 等（从 `process.env` 读取，用于服务端）

**Step 4:** Commit

```bash
git add package.json package-lock.json lib/env.ts
git commit -m "chore: add zustand, firebase, sqlite, vitest and env helper"
```

---

## Phase 2：数据模型与持久化

### Task 3: 定义 Note 类型与 Zustand store 骨架

**Files:**
- Create: `types/note.ts`
- Create: `stores/useNotesStore.ts`

**Step 1:** 在 `types/note.ts` 中定义 `Note` 接口（id, title, content, createdAt, updatedAt）

**Step 2:** 在 `stores/useNotesStore.ts` 中创建 Zustand store：state 为 `notes: Note[]`, `currentId: string | null`；actions 占位：`setNotes`, `addNote`, `updateNote`, `deleteNote`, `setCurrentId`（先不接 API/Firestore）

**Step 3:** Commit

```bash
git add types/note.ts stores/useNotesStore.ts
git commit -m "feat: add Note type and notes Zustand store"
```

---

### Task 4: SQLite 数据库初始化与 CRUD 封装

**Files:**
- Create: `lib/db.ts`（初始化 better-sqlite3，创建 notes 表）
- Create: `lib/notes-db.ts`（getAll, getById, create, update, delete）

**Step 1:** 在 `lib/db.ts` 中创建 SQLite 连接（文件路径如 `./data/notes.sqlite`），建表 `notes (id, title, content, createdAt, updatedAt)`

**Step 2:** 在 `lib/notes-db.ts` 中实现 CRUD，返回与 `Note` 类型一致的对象

**Step 3:** 运行 Node 脚本或从 API 调用一次，确认表创建成功（可手写最小脚本在 plan 中或后续 Task 通过 API 验证）

**Step 4:** Commit

```bash
git add lib/db.ts lib/notes-db.ts
git commit -m "feat: sqlite notes table and crud helpers"
```

---

### Task 5: Firebase Firestore 初始化与笔记集合封装

**Files:**
- Create: `lib/firebase.ts`（初始化 app 与 Firestore，使用 env 的 Firebase config）
- Create: `lib/notes-firestore.ts`（订阅集合、add、update、delete，与 Note 类型一致）

**Step 1:** 在 `.env.local.example` 中列出 `NEXT_PUBLIC_FIREBASE_*` 与 `LLM_PROVIDER`, `OPENAI_API_KEY` 等，README 中说明复制为 `.env.local`

**Step 2:** `lib/firebase.ts` 仅在后端或 getServerSideProps 可用时初始化；若需前端实时订阅，使用 `NEXT_PUBLIC_*` 在客户端初始化（按 Next 规范）

**Step 3:** `lib/notes-firestore.ts` 提供 `subscribeNotes(callback)`, `createNote`, `updateNote`, `deleteNote`

**Step 4:** Commit

```bash
git add lib/firebase.ts lib/notes-firestore.ts .env.local.example
git commit -m "feat: firebase firestore init and notes collection helpers"
```

---

### Task 6: LLM 适配层（可配置多厂商）

**Files:**
- Create: `lib/llm/types.ts`（StreamOptions, 流式回调类型）
- Create: `lib/llm/openai.ts`（调用 OpenAI 流式 API）
- Create: `lib/llm/deepseek.ts`（或通用 fetch 流式）
- Create: `lib/llm/index.ts`（根据 env LLM_PROVIDER 选择实现，返回统一流式接口）

**Step 1:** 定义流式调用接口：接收 `messages`, `onChunk`, `onDone`，内部使用 fetch + SSE 或 SDK

**Step 2:** 实现至少两个 provider（如 OpenAI、DeepSeek），从 env 读 API Key

**Step 3:** `lib/llm/index.ts` 导出 `streamChat(messages, options)`，内部根据 `process.env.LLM_PROVIDER` 分发

**Step 4:** Commit

```bash
git add lib/llm/
git commit -m "feat: configurable LLM adapter (OpenAI, DeepSeek, stream)"
```

---

## Phase 3：API Routes

### Task 7: 笔记 CRUD API（Next.js Route Handlers）

**Files:**
- Create: `app/api/notes/route.ts`（GET 列表, POST 创建）
- Create: `app/api/notes/[id]/route.ts`（GET, PUT, DELETE）

**Step 1:** GET /api/notes 从 SQLite（或 Firestore）返回列表；POST 创建并返回新 note

**Step 2:** GET/PUT/DELETE /api/notes/[id] 分别实现读取、更新、删除

**Step 3:** 使用 `lib/notes-db.ts`（若主用 SQLite）或 `lib/notes-firestore.ts`，保证与前端 Note 类型一致

**Step 4:** 用 curl 或浏览器验证 CRUD

**Step 5:** Commit

```bash
git add app/api/notes/
git commit -m "feat: notes CRUD API routes"
```

---

### Task 8: AI 流式代理 API

**Files:**
- Create: `app/api/ai/stream/route.ts`

**Step 1:** POST /api/ai/stream 接收 body `{ content: string }`（或 selectedText + fullContent），调用 `lib/llm` 的流式方法

**Step 2:** 返回 Response 为 ReadableStream，以 SSE 或 chunked 逐块推送文本；使用服务端 env 的 API Key，不暴露给前端

**Step 3:** 前端可 fetch 该 endpoint 并消费 stream（下一 Phase 使用）

**Step 4:** Commit

```bash
git add app/api/ai/stream/route.ts
git commit -m "feat: AI stream proxy API"
```

---

## Phase 4：前端页面与组件

### Task 9: 笔记列表页（App Router）

**Files:**
- Create: `app/page.tsx`
- Create: `app/layout.tsx`（若尚未满足 Tailwind 全局样式）
- Modify: `stores/useNotesStore.ts`（在 mount 时从 /api/notes 拉取并 setNotes）

**Step 1:** 列表页展示 notes 列表（标题 + 摘要或时间），点击进入详情（Link 到 `/note/[id]`）

**Step 2:** 提供「新建笔记」按钮，调用 API 创建后跳转详情或刷新列表

**Step 3:** 使用 Zustand 从 store 读 notes；在 layout 或 page 中 useEffect 拉取 /api/notes 并 setNotes

**Step 4:** 响应式：桌面与 375–420px 布局可用（Tailwind 断点）

**Step 5:** Commit

```bash
git add app/page.tsx app/layout.tsx stores/useNotesStore.ts
git commit -m "feat: notes list page and fetch on load"
```

---

### Task 10: 笔记详情页（编辑 + 删除）

**Files:**
- Create: `app/note/[id]/page.tsx`
- Create: `components/NoteEditor.tsx`（受控 textarea 或 contenteditable，绑定 store 的当前 note content）

**Step 1:** 详情页根据 id 从 store 或 API 取 note；若无则 404 或重定向列表

**Step 2:** NoteEditor 支持编辑 content；防抖或 onBlur 时调用 PUT /api/notes/[id] 并更新 store

**Step 3:** 删除按钮：调用 DELETE /api/notes/[id]，成功后跳转列表并更新 store

**Step 4:** Commit

```bash
git add app/note/[id]/page.tsx components/NoteEditor.tsx
git commit -m "feat: note detail page with edit and delete"
```

---

### Task 11: 「AI 处理」按钮与选中/全文逻辑

**Files:**
- Modify: `app/note/[id]/page.tsx`
- Create: `components/AiProcessButton.tsx`（或内联在详情页）

**Step 1:** 在详情页增加「AI 处理」按钮；点击时读取当前选中文本（window.getSelection）；若无选中则取整篇 content

**Step 2:** 将选中的内容或全文作为请求体调用 POST /api/ai/stream，获取 stream 引用

**Step 3:** 不在此 Task 内改原笔记内容，仅打通「点击 → 请求 → 拿到 stream」（下一 Task 接悬浮框）

**Step 4:** Commit

```bash
git add app/note/[id]/page.tsx components/AiProcessButton.tsx
git commit -m "feat: AI process button and selection/full content"
```

---

### Task 12: 悬浮框（Modal）与流式展示、接受/丢弃

**Files:**
- Create: `components/AiResultModal.tsx`
- Modify: `app/note/[id]/page.tsx`（打开 Modal，传入 stream 与 onAccept/onDiscard）

**Step 1:** AiResultModal 接收 props：`stream: ReadableStream | null`, `onAccept(content: string)`, `onDiscard()`

**Step 2:** 消费 stream，逐 chunk 追加到 Modal 内展示区域（先简单 div + 追加 text，万行优化在 Task 15）

**Step 3:** 流式期间原笔记内容不改动；Modal 内提供「接受」「丢弃」按钮；接受时 onAccept(流式得到的全文)，丢弃时 onDiscard() 关闭 Modal

**Step 4:** 详情页 onAccept：若之前是选中则替换选中部分，否则替换整篇；调用 PUT 更新并关闭 Modal

**Step 5:** Commit

```bash
git add components/AiResultModal.tsx app/note/[id]/page.tsx
git commit -m "feat: AI result modal with stream display, accept and discard"
```

---

### Task 13: Firestore 实时同步（Zustand 与列表/详情联动）

**Files:**
- Modify: `lib/notes-firestore.ts` 或新增 `lib/notes-sync.ts`
- Modify: `stores/useNotesStore.ts`
- Modify: `app/api/notes/*`（可选：API 同时写 SQLite 与 Firestore，或仅 Firestore 作为主数据源）

**Step 1:** 决定数据主源：若主用 Firestore，则 API 读写作 Firestore；SQLite 可仅作本地备份或省略

**Step 2:** 前端在 layout 或 provider 中订阅 Firestore notes 集合，onSnapshot 时 setNotes，实现多端实时同步

**Step 3:** 新建/编辑/删除时写 Firestore（或通过 API 写），保证列表与详情即时更新

**Step 4:** Commit

```bash
git add lib/notes-firestore.ts stores/useNotesStore.ts app/api/notes/
git commit -m "feat: firestore real-time sync for notes"
```

---

## Phase 5：加分项优化与测试

### Task 14: 万行流式不卡顿（虚拟化/分片 + rAF）

**Files:**
- Modify: `components/AiResultModal.tsx`
- Create: `components/StreamingText.tsx`（可选，封装流式展示逻辑）

**Step 1:** 流式展示区域使用「分片渲染」：每 N 字符或每 rAF 一批追加一次 DOM，避免每字一次导致重排卡顿

**Step 2:** 若内容超长（如 >5000 行），考虑虚拟滚动（react-window 或类似）只渲染可见区域；或先实现分片 + rAF，再在超长时启用虚拟列表

**Step 3:** 验证：生成 1 万行流式输出，悬浮框内滚动与打字不卡顿

**Step 4:** Commit

```bash
git add components/AiResultModal.tsx components/StreamingText.tsx
git commit -m "feat: long-form stream display with rAF and optional virtualization"
```

---

### Task 15: 流式逻辑与悬浮框的单元/组件测试

**Files:**
- Create: `vitest.config.ts`（若尚未有）
- Create: `__tests__/lib/stream-utils.test.ts`（解析 SSE chunk 的 util 若有）
- Create: `__tests__/components/AiResultModal.test.tsx`

**Step 1:** 为流式解析或工具函数写单元测试（若有独立 util）

**Step 2:** AiResultModal 组件测试：mock fetch 返回 ReadableStream，渲染 Modal，模拟接受/丢弃，断言 onAccept/onDiscard 被调用且参数正确

**Step 3:** 运行 `npm run test:run` 全部通过

**Step 4:** Commit

```bash
git add vitest.config.ts __tests__/
git commit -m "test: stream utils and AiResultModal component tests"
```

---

### Task 16: API Key 配置说明与开箱即用体验

**Files:**
- Modify: `README.md`
- Create: `.env.local.example`（已存在则补全）：`LLM_PROVIDER`, `OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY`, `NEXT_PUBLIC_FIREBASE_*`

**Step 1:** README 中写明：克隆后复制 `.env.local.example` 为 `.env.local`，填写 API Key 与（可选）Firebase 配置；`npm i && npm run dev` 即可运行

**Step 2:** 若 Key 未配置，AI 处理时返回友好错误（如 503 或 toast），不 crash

**Step 3:** Commit

```bash
git add README.md .env.local.example
git commit -m "docs: env and API key setup for reviewers"
```

---

### Task 17: 部署到 Vercel 并生成可访问链接

**Files:**
- Create: `vercel.json`（若需，否则默认 Next 即可）
- Modify: `README.md`（添加「可访问链接」章节，填写 Vercel 部署 URL）

**Step 1:** 在 Vercel 关联 GitHub 仓库，配置环境变量（LLM_PROVIDER, API Key, Firebase）；部署

**Step 2:** 将生成的 URL 写入 README，说明「可直接体验」

**Step 3:** Commit

```bash
git add vercel.json README.md
git commit -m "chore: vercel deploy and public link in README"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2025-03-07-ai-note-mate-implementation-plan.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — You open a new session with executing-plans in the same worktree for batch execution with checkpoints.

**Which approach?**

- If Subagent-Driven: **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development.
- If Parallel Session: Use superpowers:executing-plans in the new session.
