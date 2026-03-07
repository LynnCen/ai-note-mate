# 选中浮层 AI 交互 + 新颖 UI 框架 + Markdown 编辑器 — 设计文档

> 基于选项 A（选中后气泡菜单）、新颖 UI 框架选型、以及现代化笔记编辑器，在满足需求文档的前提下做前端体验升级。

---

## 1. 需求符合度结论（简要）

- **必做项与加分项**：当前项目已满足需求文档全部必做与既有加分项（列表/详情、CRUD、持久化、AI 按钮与选中/全文、悬浮框流式、接受/丢弃、TS/Tailwind/响应式等）。
- **本文档范围**：不改变需求符合度，仅做**前端交互与体验优化**——选中浮层、UI 框架统一、Markdown 编辑。

---

## 2. UI 框架选型：shadcn/ui

### 2.1 推荐：shadcn/ui

在「新颖且适合当前技术栈」的前提下，推荐采用 **shadcn/ui**：

- **定位**：基于 Radix UI + Tailwind 的**组件集合**（copy-paste 到仓库），非传统 npm 大库；代码归项目所有，可任意改。
- **与现有栈契合**：项目已用 Tailwind 与 Next.js App Router；shadcn 与 Tailwind 深度集成，不引入另一套设计 token，主题用 CSS 变量即可与现有 `globals.css` 统一。
- **组件覆盖**：提供 **Popover**、**DropdownMenu**、**Dialog**、Button、Input 等，正好用于「选中后气泡菜单」和「全屏结果 Modal」。
- **无障碍**：Radix 底层保证键盘、焦点、ARIA，适合做面试/交付的「专业级」体验。
- **流行度**：2024–2025 年 Next.js + React 生态中采用率很高，视为「新颖」且可持续维护。

### 2.2 备选（不采用）

- **NextUI**：组件精美、动效多，但引入一整套主题与设计语言，与现有 Tailwind 混用成本高。
- **Mantine**：功能全，但体量大、风格偏「后台」，与本项目「笔记 + AI」的轻量定位不完全一致。

### 2.3 落地方式

- 使用 **shadcn/ui for Next.js** 的 CLI 初始化并按需安装组件：`Popover`、`DropdownMenu`、`Dialog`、`Button`。
- 列表页、详情页的按钮与输入等可逐步替换为 shadcn 组件，**先只在新交互（选中浮层、AI Modal）上强制使用**，其余可保留现有 Tailwind 类，避免大爆炸式重构。

---

## 3. 选项 A：选中后气泡菜单（AI 浮层）

### 3.1 交互流程

1. **选中**：用户在笔记正文中选中一段文字（或整段）。
2. **出现浮层**：在选区**上方**（或下方，视选区靠近视口上下缘而定）出现一条**小浮条**（气泡菜单），内含多个 AI 动作按钮。
3. **动作示例**：至少包含「**AI 润色**」「**AI 改文**」「**AI 总结**」；点击任一项即触发当前选中内容（或无选中时整篇）的对应 AI 处理。
4. **全屏 Modal**：触发后仍使用现有 **AiResultModal**：流式展示、接受/丢弃逻辑不变；仅「入口」从页头单一按钮改为「选中 + 浮层多动作」。
5. **无选中时**：保留页头「AI 处理」按钮，点击时视为「全文 + 默认动作（如润色）」，或弹出简单位置固定的浮层让用户选动作后再进 Modal。

### 3.2 技术要点

- **选区与定位**：编辑器（见下节）需暴露「当前选区」与选区在视口中的矩形（getBoundingClientRect），用于浮层定位；若先用 textarea，可用 `selectionStart`/`selectionEnd` 与模拟/近似选区位置。
- **浮层组件**：使用 shadcn **Popover**（或 **DropdownMenu**）渲染「AI 润色 / AI 改文 / AI 总结」等按钮；浮层挂载到 body，位置用 `position: fixed` + 选区矩形计算，避免被 overflow 裁剪。
- **与现有逻辑衔接**：浮层按钮的 onClick 复用当前 `handleAiProcess` 的请求与 state 设置逻辑，仅多传一个「动作类型」参数（见 3.3）。
- **收起**：点击浮层外或选择动作后自动收起；选中取消时也可收起。

### 3.3 API 与 Prompt 扩展

- **POST /api/ai/stream**：请求体在现有 `content` 基础上增加可选字段 **`action`**：`"polish"` | `"rewrite"` | `"summarize"`（或中文键亦可，后端统一映射）。
- **服务端**：根据 `action` 选择不同 system prompt，例如：
  - `polish`：润色、扩写、保持原意；
  - `rewrite`：改写成另一种表述/风格；
  - `summarize`：总结为更短的一段。
- 前端浮层三个按钮分别对应 `polish`、`rewrite`、`summarize`；页头「AI 处理」默认使用 `polish`（或弹浮层选动作）。

---

## 4. 编辑器：Markdown 支持（现代化笔记）

### 4.1 目标

- 笔记内容支持 **Markdown 语法**：编辑时可按 MD 书写，展示时支持渲染（标题、列表、加粗、代码块等）。
- 数据模型**不变**：`content` 仍为 **string**（即 Markdown 源码），无需改后端或 SQLite 表结构。
- 交互上更「现代化」：所见即所得或分栏预览二选一（见下）。

### 4.2 方案对比与推荐

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. Tiptap** | 可扩展、可做 Notion 式块编辑、支持 MD 输入/导出 | 集成与定制量较大，依赖较多 |
| **B. @uiw/react-md-editor** | 轻量、专注 MD 编辑+预览、分栏或 Tab 切换 | 风格需用 CSS 与项目统一 |
| **C. textarea + react-markdown 预览** | 实现快、依赖少 | 编辑与预览分离，非 WYSIWYG |

**推荐**：**B. @uiw/react-md-editor**（或同类型轻量 MD 编辑器），在详情页以「编辑 | 预览」Tab 或左右分栏展示；选中逻辑需用编辑器 API 获取选区与矩形，用于 3.2 的浮层定位。若希望最少改动、先上线浮层再迭代，可短期保留 **textarea**，仅增加「预览」Tab（用 `react-markdown` 渲染 `content`），再在下一迭代替换为 B。

### 4.3 与选中浮层的配合

- 使用 Tiptap 或 react-md-editor 时，通过其 **选区 API** 获取选中文本与 `getBoundingClientRect()`，驱动「选中后气泡菜单」的显示与定位。
- 若短期保留 textarea，则沿用当前 `getSelectionRange()` 的字符区间，浮层位置可用选区对应 DOM 的 `getBoundingClientRect()` 或近似计算（如根据光标所在行估算）。

---

## 5. 其他优化（简要）

- **错误与加载**：AI 请求失败时用 **Toast 或 shadcn 的 Toast/Sonner** 替代 `alert`；请求中可对浮层按钮或页头按钮做 loading 态。
- **无障碍**：浮层与 Modal 使用 shadcn/Radix 的焦点管理与 `aria-*`，保证键盘可操作与读屏友好。
- **响应式**：选中浮层在移动端（375–420px）可改为底部抽屉或全宽小条，避免被键盘遮挡；具体可在实现阶段再定。

---

## 6. 实施顺序建议

1. **引入 shadcn/ui**：CLI 初始化，安装 Popover、Dialog、Button 等；将现有 AiResultModal 改为 shadcn Dialog（可选，也可先保留现有 Modal 仅样式微调）。
2. **API 扩展**：`/api/ai/stream` 增加 `action`，服务端按 action 切换 system prompt。
3. **选中气泡菜单**：在详情页编辑器上监听选区，用 shadcn Popover 实现「AI 润色 / 改文 / 总结」浮层，并接入现有流式 Modal。
4. **Markdown 编辑器**：在 2–3 之后接入；先「textarea + 预览 Tab」或直接上 @uiw/react-md-editor，再根据选区 API 与浮层联调。

---

## 7. 需要你确认的点

- **UI 框架**：是否确认采用 **shadcn/ui**？若确认，后续实现计划将按 shadcn 组件来写。
- **Markdown 优先级**：是否与本阶段一起做（选中浮层 + Markdown），还是本阶段只做「选中浮层 + shadcn」，Markdown 放在下一期？
- **浮层动作**：除「润色 / 改文 / 总结」外，增加固定项「**扩写**」「**翻译**」；共五档：润色、改文、总结、扩写、翻译。

确认后即可据此写详细实现计划（任务拆解与顺序）。
