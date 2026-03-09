# UX Enhancement Design Doc

**Date:** 2026-03-09

---

## 1. Agent Chat Input Redesign

### Layout (top-bottom)

```
┌──────────────────────────────────────────┐
│  [Context chips: 📄 全文 ×] [📎 doc.pdf ×] │
│                                          │
│   textarea (4 rows, auto-grow)           │
│   placeholder: "问问 Agent…"             │
│                                          │
├──────────────────────────────────────────┤
│ [+ 文件]  [DeepSeek ▾]    [■ 停止 / 发送]│
└──────────────────────────────────────────┘
```

### Context Chip

- Default chip: "📄 全文" — passes full note content to Agent
- When editor has selected text: chip becomes "✂️ 已选：前15字…"
- Chip has × to dismiss; dismissed → no note context passed
- File upload creates additional chip(s) — "📎 doc.pdf ×"

### File Upload

- Formats: PDF, DOCX, TXT/MD
- New API: `POST /api/file/parse` — multer upload → server-side parsing:
  - PDF: `pdf-parse` npm package
  - DOCX: `mammoth` npm package
  - TXT/MD: raw text
- Response: `{ text: string, filename: string }`
- Parsed text injected into Agent context as file attachment

### Model Selector

- New API: `GET /api/ai/providers` — returns list of provider IDs whose API keys are set
- Dropdown only shows configured providers
- Selected provider stored in component state, passed in Agent chat request body
- Backend `/api/ai/chat` respects `provider` param (overrides LLM_PROVIDER env)

### Stop / Send Button

- Streaming idle: green "发送" button (primary style)
- Streaming active: red "■ 停止" button replaces Send
- Both in bottom-right corner of input toolbar

---

## 2. Markdown Rendering in Agent Messages

- New `<AgentMarkdown content={string} />` component wrapping `react-markdown`
- Styles match `MarkdownPreview` prose classes
- Used in `AgentMessage` for `fullContent` display
- Used in `AgentEventCard` for `tool_result` content (code blocks, lists)

---

## 3. Editor: Default Preview Mode + Dynamic Height

### Default Preview Mode

- `page.tsx` state: `editorMode: "preview" | "edit"` (default: `"preview"`)
- Header button: "✏️ 编辑" in preview mode, "👁 预览" in edit mode
- Preview: renders `<MarkdownPreview content={content} />` inline (no tabs)
- Edit: shows `<NoteEditor>` with full toolbar

### Dynamic Height

- `useResizableHeight` hook: manages `editorHeight` state (min 300px, default 60vh)
- Drag handle at bottom of editor area
- Persists to `localStorage`

---

## 4. Left Sidebar

### Layout

```
[Sidebar 220px] | [Editor area] | [Agent Chat Panel]
```

### Collapse

- `useSidebarState` hook: `collapsed: boolean` (stored in localStorage)
- Collapsed: sidebar width = 0, a `›` icon bar (32px wide) shown on left
- Expanded: sidebar visible with `‹` button at top-right corner

### Tabs

**"笔记" Tab:**
- Lists all notes from Zustand store (title + updatedAt)
- Click navigates to note
- Current note highlighted
- Search input at top

**"大纲" Tab:**
- Parse H1–H3 headings from current `content` state (regex or remark)
- Render as nested tree with indent per heading level
- Click item: smooth scroll to heading in editor/preview
- Empty state: "暂无标题，在正文中添加 # 标题"

---

## 5. Agent Chat Panel Collapsible

### Behavior

- Panel has a collapse button on its left edge (the divider area)
- Collapsed: panel width → 0, divider shows "◀ Agent" vertical tab
- Click tab to re-expand
- State stored in localStorage (alongside panel width)

---

## Files to Create/Modify

| File | Change |
|---|---|
| `src/client/components/agent/AgentInput.tsx` | Full rewrite — new top-bottom layout |
| `src/client/components/agent/AgentMarkdown.tsx` | New — markdown wrapper for Agent messages |
| `src/client/components/agent/AgentMessage.tsx` | Use AgentMarkdown for fullContent |
| `src/client/components/agent/AgentEventCard.tsx` | Use AgentMarkdown for tool_result body |
| `src/client/components/agent/AgentChatPanel.tsx` | Accept modelOverride, selectedText, onStop props |
| `src/client/hooks/useResizableHeight.ts` | New — vertical drag resize hook |
| `src/client/hooks/useSidebarState.ts` | New — sidebar collapse state |
| `src/client/components/layout/Sidebar.tsx` | New — notes list + outline tabs |
| `src/client/components/notes/OutlineNav.tsx` | New — parses headings, click-to-scroll |
| `app/api/file/parse/route.ts` | New — file upload + parsing API |
| `app/api/ai/providers/route.ts` | New — returns configured providers |
| `app/note/[id]/page.tsx` | Major update — sidebar, preview/edit mode, panel collapse |
