# 选中浮层 AI + shadcn/ui + Markdown 编辑器 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 AI 笔记应用上增加「选中后气泡菜单」（AI 润色/改文/总结）、采用 shadcn/ui 统一浮层与弹窗，并可选支持 Markdown 编辑与预览。

**Architecture:** 详情页编辑器选区变化时展示 shadcn Popover 气泡菜单；点击动作后请求 /api/ai/stream?action=polish|rewrite|summarize，沿用现有 AiResultModal 流式与接受/丢弃。API 根据 action 切换 system prompt。编辑器可先保留 textarea 并加预览 Tab，或接入 @uiw/react-md-editor。

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui (Radix + Tailwind), 现有 Zustand / API / AiResultModal。

**Design reference:** `docs/plans/2025-03-07-selection-ai-and-ui-design.md`

---

## Phase 1: 引入 shadcn/ui

### Task 1: 初始化 shadcn/ui 并安装所需组件

**Files:**
- Create: `components.json` (shadcn config)
- Modify: `tailwind.config.ts` 或按 shadcn 要求调整
- Create: `components/ui/button.tsx`, `components/ui/popover.tsx`, `components/ui/dialog.tsx`（或通过 CLI 生成）

**Step 1:** 在项目根目录执行 shadcn 初始化（Next.js + Tailwind 已存在，选 not overwrite 已有文件）

```bash
cd /Users/lynncen/code/ai-note-mate && npx shadcn@latest init
```
选择: Default style, Zinc color, CSS variables for colors; 不覆盖现有 tailwind.config 若 CLI 提示.

**Step 2:** 安装 Popover、Button、Dialog 组件

```bash
npx shadcn@latest add popover button dialog
```

**Step 3:** 确认 `components/ui/` 下存在 `button.tsx`, `popover.tsx`, `dialog.tsx`，且 `app/globals.css` 已包含 shadcn 所需 CSS 变量（若 init 时已注入则跳过）

**Step 4:** Commit

```bash
git add components.json components/ui/ app/globals.css package.json
git commit -m "chore: add shadcn/ui and popover, button, dialog components"
```

---

### Task 2: 用 shadcn Dialog 包装或替换现有 AiResultModal 容器（可选）

**Files:**
- Modify: `components/AiResultModal.tsx`

**Step 1:** 将当前 Modal 最外层 `<div className="fixed inset-0 ...">` 改为使用 shadcn `<Dialog>`（DialogTrigger 不需要，仅用 DialogContent 包裹内容），保留内部流式展示与接受/丢弃逻辑不变。

**Step 2:** 保证 AiResultModal 仍接收 `stream`, `onAccept`, `onDiscard` props；由父组件控制 open state（stream !== null 即 open）。

**Step 3:** 视觉与无障碍：Dialog 的 title、description、关闭行为与现有一致；运行 `npm run dev` 验证 AI 流程仍正常。

**Step 4:** Commit

```bash
git add components/AiResultModal.tsx
git commit -m "refactor(ui): wrap AI result modal with shadcn Dialog"
```

---

## Phase 2: API 支持多动作（action）

### Task 3: POST /api/ai/stream 支持 action 参数

**Files:**
- Modify: `app/api/ai/stream/route.ts`
- Modify: `lib/llm/types.ts`（若需在 streamChat 层传 action）

**Step 1:** 请求体解析增加可选 `action`：`"polish" | "rewrite" | "summarize" | "expand" | "translate"`，默认 `"polish"`。

**Step 2:** 根据 action 选择 system prompt 字符串：
- polish: "You help polish and expand the user's note. Output only the improved text, no preamble or explanation."
- rewrite: "Rewrite the user's text in a different style or phrasing. Output only the rewritten text, no preamble."
- summarize: "Summarize the user's text concisely. Output only the summary, no preamble."
- expand: "Expand the user's text with more detail and depth. Keep the same tone and meaning. Output only the expanded text, no preamble."
- translate: "Translate the user's text to Chinese if it is in another language, or to English if it is in Chinese. Output only the translation, no preamble."

**Step 3:** 调用现有 `streamChat([{ role: "system", content: chosenPrompt }, { role: "user", content }], undefined)`，无需改 lib/llm 接口（prompt 在 route 内决定即可）。

**Step 4:** 用 curl 或前端传 `body: JSON.stringify({ content: "test", action: "summarize" })` 验证不同 action 返回不同风格结果。

**Step 5:** Commit

```bash
git add app/api/ai/stream/route.ts
git commit -m "feat(api): add action polish|rewrite|summarize|expand|translate to AI stream"
```

---

## Phase 3: 选中后气泡菜单（选项 A）

### Task 4: 选区状态与浮层定位

**Files:**
- Create: `components/SelectionAiPopover.tsx`
- Modify: `app/note/[id]/page.tsx`

**Step 1:** 在详情页增加 state：`selectionRect: DOMRect | null`、`selectionText: string`（或复用现有 editorRef.getSelectionRange + content.slice）。在 NoteEditor 的 onMouseUp/onKeyUp 或 onSelect 时更新：若有选区则 setSelectionRect(editorRef.current.getSelectionRect()) 与 setSelectionText(...)；无选区则 setSelectionRect(null)。若当前编辑器是 textarea，可用 `textareaRef.current.getBoundingClientRect()` 与 selectionStart/End 近似计算选区矩形（例如用 mock 的 span 或 document.createRange 计算，或简化为在 textarea 上方固定位置显示浮层）。

**Step 2:** 新建 `SelectionAiPopover`：接收 props `open: boolean`, `onOpenChange`, `position: { top, left } | null`, `onAction: (action: 'polish'|'rewrite'|'summarize'|'expand'|'translate') => void`。内部使用 shadcn Popover，内容为五个 Button：「AI 润色」「AI 改文」「AI 总结」「AI 扩写」「AI 翻译」，点击后调用 onAction 并关闭。

**Step 3:** 在详情页渲染 SelectionAiPopover，当 selectionRect 非空时 open=true，position 为选区上方居中或左对齐；onAction 时调用与现有 handleAiProcess 相同的请求逻辑，但 body 增加 `action` 字段。

**Step 4:** 无选中时点击页头「AI 处理」仍使用当前 handleAiProcess（默认 action=polish 或弹浮层选动作）。若产品要求页头也选动作，可再增加一个 Popover 挂在页头按钮上。

**Step 5:** Commit

```bash
git add components/SelectionAiPopover.tsx app/note/[id]/page.tsx
git commit -m "feat(ui): selection bubble menu for AI polish/rewrite/summarize"
```

---

### Task 5: 前端请求携带 action 并接 Modal

**Files:**
- Modify: `app/note/[id]/page.tsx`

**Step 1:** handleAiProcess 或从 SelectionAiPopover 调用的处理函数增加参数 `action: 'polish' | 'rewrite' | 'summarize' | 'expand' | 'translate'`。请求 body 为 `JSON.stringify({ content: contentToSend, action })`。

**Step 2:** 确认 AiResultModal 打开后流式展示与接受/丢弃行为不变；接受时仍替换选中部分或全文。

**Step 3:** 手动测试：选中一段文字 → 浮层出现 → 点「AI 总结」→ Modal 中为总结结果；点「接受」后笔记更新。

**Step 4:** Commit

```bash
git add app/note/[id]/page.tsx
git commit -m "feat: pass action to AI stream and wire selection popover to modal"
```

---

## Phase 4: Markdown 编辑器（可选，可后做）

### Task 6: 增加 Markdown 预览 Tab（textarea 保留）

**Files:**
- Create: `components/MarkdownPreview.tsx`（使用 react-markdown）
- Modify: `app/note/[id]/page.tsx` 或 `components/NoteEditor.tsx`

**Step 1:** `npm i react-markdown`。新建 MarkdownPreview：接收 `content: string`，渲染 `<ReactMarkdown>{content}</ReactMarkdown>`，基础样式（prose 或自定义）。

**Step 2:** 在详情页内容区增加 Tab：「编辑」|「预览」；编辑为现有 NoteEditor，预览为 MarkdownPreview(content)。数据仍为同一 content string，不改变 API。

**Step 3:** 若后续接入 MD 编辑器（如 @uiw/react-md-editor），可替换「编辑」Tab 内容，本 Task 仅做预览与 Tab 结构。

**Step 4:** Commit

```bash
git add components/MarkdownPreview.tsx app/note/[id]/page.tsx package.json
git commit -m "feat(editor): add Markdown preview tab"
```

---

### Task 7（可选）: 接入 @uiw/react-md-editor 替代 textarea

**Files:**
- Modify: `components/NoteEditor.tsx` 或新建 `components/MdEditor.tsx`
- Modify: `app/note/[id]/page.tsx`

**Step 1:** `npm i @uiw/react-md-editor`。用 MdEditor 组件替代 textarea，value/onChange 与现有一致；需暴露 getSelectionRange 或等价的选区 API 供 SelectionAiPopover 定位（查阅该库文档）。

**Step 2:** 若库不支持选区矩形，可保留「无选区时浮层不显示」或「浮层固定在编辑器上方」的降级方案。

**Step 3:** 样式与暗色模式与现有 Tailwind 协调。

**Step 4:** Commit

```bash
git add components/MdEditor.tsx app/note/[id]/page.tsx package.json
git commit -m "feat(editor): replace textarea with Markdown editor"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2025-03-07-selection-ai-ui-implementation-plan.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — Open a new session with executing-plans in the same worktree for batch execution with checkpoints.

**Which approach?**

- If Subagent-Driven: **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development.
- If Parallel Session: Use superpowers:executing-plans in the new session.
