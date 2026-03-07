# 前端体验增强 — 实施计划

> 对应设计文档：`docs/plans/2025-03-07-frontend-ux-enhancement-design.md`

---

## Phase 1：交互与反馈

### Task 1.1：接入 Toast（Sonner）

- 安装 shadcn Sonner：`npx shadcn add sonner`
- 在 `app/layout.tsx` 中挂载 `<Toaster />`（或按 shadcn 文档放置）
- 确认 `toast.success()` / `toast.error()` 在客户端可用

### Task 1.2：AI 错误与异常改为 Toast

- 文件：`app/note/[id]/page.tsx`
- 将 `handleAiProcess` 内所有 `alert(...)` 改为 `toast.error(...)`（文案保持中文）
- 网络异常或 `res.ok` 为 false 时统一用 `toast.error`，不再 `alert`

### Task 1.3：保存成功 Toast

- 标题保存成功（`saveTitle` 内 res.ok 且 data 存在）：`toast.success("标题已保存")`
- 内容保存成功（`saveContent` 内）：`toast.success("内容已保存")`
- AI 接受并保存成功（`handleAiAccept` 内 PUT 成功）：`toast.success("已应用并保存")`

### Task 1.4：删除确认（AlertDialog）

- 安装 shadcn AlertDialog：`npx shadcn add alert-dialog`
- 详情页增加 state `deleteDialogOpen`，点击「删除笔记」时设为 true
- 使用 `<AlertDialog>`：标题「删除笔记」，描述「确定要删除这篇笔记吗？此操作不可恢复。」，取消 / 确定
- 确定后发 DELETE 请求，成功则 `toast.success("笔记已删除")` + `router.push("/")`，并关闭对话框

### Task 1.5：删除成功 Toast

- 在 `handleDelete` 成功分支内调用 `toast.success("笔记已删除")`（与 1.4 合并实现即可）

---

## Phase 2：编辑器样式与控件（后续）

- 通过 CSS 覆盖 MDEditor 的 `.w-md-editor`、`.w-md-editor-toolbar` 等，统一 border、背景、圆角与 shadcn token
- 确保 `data-color-mode` 与 html.dark 同步（已有），暗色对比度检查

---

## Phase 3：视觉与动效（后续）

- 列表卡片 hover 过渡；空状态插图/图标；首页/详情加载骨架或占位；Modal/AlertDialog 使用已有 transition

---

## Phase 4：信息与结构（后续）

- 列表排序（最近更新在前）；可选搜索；详情面包屑或「上次保存」/ 字数

---

## 执行顺序

先完成 Phase 1 全部 Task（1.1–1.5），再按需进行 Phase 2–4。
