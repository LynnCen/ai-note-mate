# UX Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver 5 UX improvements: redesigned Agent input, Markdown rendering in messages, editor preview-default + dynamic height, left sidebar with notes/outline tabs, and collapsible Agent chat panel.

**Architecture:** The changes are split across three layers — new shared components (AgentMarkdown, OutlineNav, Sidebar), new hooks (useResizableHeight, useSidebarState), new API routes (/api/ai/providers, /api/file/parse), and a major update to the note detail page layout to become a 3-column view with a collapsible left sidebar and collapsible right Agent panel.

**Tech Stack:** Next.js 15 App Router, TypeScript, React, Zustand, Tailwind CSS v4, shadcn/ui, react-markdown (already installed), pdf-parse, mammoth

---

## Task 1: AgentMarkdown component + integrate into messages

**Files:**
- Create: `src/client/components/agent/AgentMarkdown.tsx`
- Modify: `src/client/components/agent/AgentMessage.tsx`
- Modify: `src/client/components/agent/AgentEventCard.tsx`

**Step 1: Create AgentMarkdown component**

```tsx
// src/client/components/agent/AgentMarkdown.tsx
"use client";

import ReactMarkdown from "react-markdown";

interface AgentMarkdownProps {
  content: string;
  className?: string;
}

export function AgentMarkdown({ content, className = "" }: AgentMarkdownProps) {
  return (
    <div className={`agent-markdown text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-base font-semibold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-2.5 mb-1 text-sm font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2 mb-0.5 text-sm font-medium">{children}</h3>,
          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-1.5 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-1.5 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          code: ({ children, className: cls }) => {
            const isBlock = cls?.startsWith("language-");
            return isBlock ? (
              <code className={`block font-mono text-xs ${cls ?? ""}`}>{children}</code>
            ) : (
              <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-border pl-3 italic text-muted-foreground">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-primary underline hover:no-underline">{children}</a>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          hr: () => <hr className="my-2 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

**Step 2: Update AgentMessage to use AgentMarkdown**

Replace `<p className="whitespace-pre-wrap">{message.fullContent}</p>` with `<AgentMarkdown content={message.fullContent} />` in the fullContent block.

Import: `import { AgentMarkdown } from "./AgentMarkdown";`

Full updated rendering block for fullContent (lines ~41-58 in AgentMessage.tsx):
```tsx
{message.fullContent && (
  <div className="rounded-2xl bg-muted px-3 py-2.5 text-sm text-foreground">
    <AgentMarkdown content={message.fullContent} />

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
```

**Step 3: Update AgentEventCard to use AgentMarkdown for tool_result**

Read `src/client/components/agent/AgentEventCard.tsx` first.
In the `tool_result` event rendering section, replace plain text display of `event.content` with `<AgentMarkdown content={event.content ?? ""} />`.

**Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 5: Commit**

```bash
git add src/client/components/agent/AgentMarkdown.tsx src/client/components/agent/AgentMessage.tsx src/client/components/agent/AgentEventCard.tsx
git commit -m "feat: add AgentMarkdown component, render markdown in agent messages"
```

---

## Task 2: Rewrite AgentInput — top-bottom layout, context chip, stop/send toggle

**Files:**
- Modify: `src/client/components/agent/AgentInput.tsx`
- Modify: `src/client/components/agent/AgentChatPanel.tsx`
- Create: `__tests__/components/AgentInput.test.tsx`

**Step 1: Write failing test**

```tsx
// __tests__/components/AgentInput.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentInput } from "@client/components/agent/AgentInput";
import { describe, it, expect, vi } from "vitest";

describe("AgentInput", () => {
  it("shows Send button when not streaming", () => {
    render(<AgentInput onSend={vi.fn()} onStop={vi.fn()} streaming={false} />);
    expect(screen.getByRole("button", { name: /发送/i })).toBeInTheDocument();
  });

  it("shows Stop button when streaming", () => {
    render(<AgentInput onSend={vi.fn()} onStop={vi.fn()} streaming={true} />);
    expect(screen.getByRole("button", { name: /停止/i })).toBeInTheDocument();
  });

  it("shows default context chip '全文'", () => {
    render(<AgentInput onSend={vi.fn()} onStop={vi.fn()} streaming={false} />);
    expect(screen.getByText(/全文/)).toBeInTheDocument();
  });

  it("calls onStop when Stop button clicked", () => {
    const onStop = vi.fn();
    render(<AgentInput onSend={vi.fn()} onStop={onStop} streaming={true} />);
    fireEvent.click(screen.getByRole("button", { name: /停止/i }));
    expect(onStop).toHaveBeenCalled();
  });
});
```

Run: `npx vitest run __tests__/components/AgentInput.test.tsx`
Expected: FAIL (component API doesn't match yet)

**Step 2: Rewrite AgentInput**

```tsx
// src/client/components/agent/AgentInput.tsx
"use client";

import { useRef, useState, useCallback } from "react";
import { Button } from "@client/components/ui/button";
import { Square, Send, Plus, X, FileText } from "lucide-react";

export interface ContextChip {
  type: "note" | "file";
  label: string;
  content?: string;  // resolved text content (for files)
}

export interface AgentInputProps {
  onSend: (message: string, contextChips: ContextChip[]) => void;
  onStop: () => void;
  streaming: boolean;
  /** Currently selected text from the editor; if set, shows as selection chip */
  selectedText?: string;
  /** Full note content — used as default "全文" chip value */
  noteContent?: string;
  /** Available models (provider ids) */
  availableModels?: string[];
  /** Currently selected model */
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

const MODEL_LABELS: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  gml: "GLM",
  groq: "Groq",
};

export function AgentInput({
  onSend,
  onStop,
  streaming,
  selectedText,
  noteContent = "",
  availableModels = [],
  selectedModel,
  onModelChange,
}: AgentInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Context chips: starts with "全文" or selected-text chip
  const defaultChip: ContextChip = selectedText
    ? { type: "note", label: `已选：${selectedText.slice(0, 15)}${selectedText.length > 15 ? "…" : ""}`, content: selectedText }
    : { type: "note", label: "全文", content: noteContent };

  const [chips, setChips] = useState<ContextChip[]>([defaultChip]);
  const [uploading, setUploading] = useState(false);

  // Sync default chip when selectedText or noteContent changes
  // (use key prop in parent to reset — simpler than useEffect sync)

  function removeChip(idx: number) {
    setChips((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/file/parse", { method: "POST", body: formData });
      if (!res.ok) return;
      const { text: fileText, filename } = (await res.json()) as { text: string; filename: string };
      setChips((prev) => [...prev, { type: "file", label: filename, content: fileText }]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed, chips);
    setText("");
    textareaRef.current?.focus();
  }, [text, chips, streaming, onSend]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-background p-3 space-y-2">
      {/* Context chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="max-w-[120px] truncate">{chip.label}</span>
              <button
                type="button"
                onClick={() => removeChip(i)}
                className="ml-0.5 rounded-full hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={streaming}
        placeholder="问问 Agent… (Enter 发送，Shift+Enter 换行)"
        rows={4}
        className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: file upload + model selector */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
            title="上传文件"
          >
            <Plus className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={handleFileUpload}
          />

          {availableModels.length > 1 && onModelChange && (
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Stop or Send */}
        {streaming ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={onStop}
            className="gap-1.5"
          >
            <Square className="h-3 w-3 fill-current" />
            停止
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={!text.trim()}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Update AgentChatPanel to use new AgentInput API**

- Remove the separate `{streaming && <stop-bar>}` div (the stop button now lives inside AgentInput)
- Add `availableModels`, `selectedModel`, `onModelChange` state to panel
- Fetch `/api/ai/providers` on mount to populate `availableModels`
- Pass `selectedText` prop through to AgentInput (add prop to AgentChatPanel)
- Update `sendMessage` to accept `(text: string, chips: ContextChip[])` and pass chip content as additional context in the request body

In AgentChatPanel.tsx:
```tsx
// Add to AgentChatPanelProps:
selectedText?: string;

// Add state:
const [availableModels, setAvailableModels] = useState<string[]>([]);
const [selectedModel, setSelectedModel] = useState<string | undefined>();

// Fetch providers on mount:
useEffect(() => {
  fetch("/api/ai/providers")
    .then((r) => r.json())
    .then((data: { providers: string[] }) => {
      setAvailableModels(data.providers);
      setSelectedModel(data.providers[0]);
    })
    .catch(() => {});
}, []);

// Update sendMessage signature:
const sendMessage = useCallback(
  async (userText: string, contextChips: ContextChip[]) => {
    // ... existing logic ...
    // In fetch body, add:
    body: JSON.stringify({
      messages: ...,
      noteId,
      noteTitle,
      noteContent,
      allNotes: ...,
      provider: selectedModel,
      attachments: contextChips
        .filter((c) => c.type === "file")
        .map((c) => ({ filename: c.label, content: c.content ?? "" })),
    }),
```

Replace `<AgentInput onSend={sendMessage} disabled={streaming} />` with:
```tsx
<AgentInput
  onSend={sendMessage}
  onStop={stopStreaming}
  streaming={streaming}
  selectedText={selectedText}
  noteContent={noteContent}
  availableModels={availableModels}
  selectedModel={selectedModel}
  onModelChange={setSelectedModel}
/>
```

**Step 4: Run tests**

```bash
npx vitest run __tests__/components/AgentInput.test.tsx
```
Expected: PASS (4 tests)

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 6: Commit**

```bash
git add src/client/components/agent/AgentInput.tsx src/client/components/agent/AgentChatPanel.tsx __tests__/components/AgentInput.test.tsx
git commit -m "feat: redesign AgentInput with context chips, stop/send toggle, file upload UI"
```

---

## Task 3: API routes — /api/ai/providers and /api/file/parse

**Files:**
- Create: `app/api/ai/providers/route.ts`
- Create: `app/api/file/parse/route.ts`

**Step 1: Install pdf-parse and mammoth**

```bash
npm install pdf-parse mammoth
npm install --save-dev @types/pdf-parse
```

Expected: packages added to package.json

**Step 2: Create /api/ai/providers**

```ts
// app/api/ai/providers/route.ts
import { NextResponse } from "next/server";
import { getOpenAIKey, getDeepSeekKey, getGmlKey, getGroqKey } from "@server/env";

export async function GET() {
  const providers: string[] = [];
  if (getOpenAIKey()) providers.push("openai");
  if (getDeepSeekKey()) providers.push("deepseek");
  if (getGmlKey()) providers.push("gml");
  if (getGroqKey()) providers.push("groq");
  return NextResponse.json({ providers });
}
```

**Step 3: Create /api/file/parse**

```ts
// app/api/file/parse/route.ts
import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(arrayBuffer);
  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase();

  let text = "";

  try {
    if (ext === "pdf") {
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (ext === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === "txt" || ext === "md") {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
    }
  } catch (err) {
    console.error("[file/parse] error:", err);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }

  // Truncate if very long
  const MAX_CHARS = 20000;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + "\n\n[内容已截断，仅显示前 20000 字]";
  }

  return NextResponse.json({ text, filename });
}
```

**Step 4: Update /api/ai/chat to respect provider override**

In `app/api/ai/chat/route.ts`, read `provider` from request body and pass to `runToolCallingLoop`.

Read the current route first, then update:
- Extract `provider?: string` from body
- Pass it to `runToolCallingLoop` (or set env override per-request if loop doesn't accept it)

If `runToolCallingLoop` doesn't currently accept a provider override, add an optional `providerOverride?: string` param to `AgentContext` in `src/agents/types.ts` and thread it through.

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 6: Commit**

```bash
git add app/api/ai/providers/route.ts app/api/file/parse/route.ts app/api/ai/chat/route.ts src/agents/types.ts
git commit -m "feat: add /api/ai/providers and /api/file/parse routes; support per-request provider override"
```

---

## Task 4: Editor default preview mode + dynamic height

**Files:**
- Create: `src/client/hooks/useResizableHeight.ts`
- Modify: `app/note/[id]/page.tsx`

**Step 1: Create useResizableHeight hook**

```ts
// src/client/hooks/useResizableHeight.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "note-editor-height";
const DEFAULT_HEIGHT = Math.round(window !== undefined ? window.innerHeight * 0.55 : 400);
const MIN_HEIGHT = 200;

export function useResizableHeight(storageKey = STORAGE_KEY) {
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === "undefined") return 400;
    const stored = localStorage.getItem(storageKey);
    return stored ? parseInt(stored, 10) : Math.round(window.innerHeight * 0.55);
  });
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
  }, [height]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = e.clientY - startY.current;
      const newH = Math.max(MIN_HEIGHT, startH.current + delta);
      setHeight(newH);
    }
    function onMouseUp() {
      if (isDragging.current) {
        isDragging.current = false;
        setHeight((h) => {
          localStorage.setItem(storageKey, String(h));
          return h;
        });
      }
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [storageKey]);

  return { height, onHandleMouseDown };
}
```

**Step 2: Update page.tsx for preview-default + resizable height**

In `app/note/[id]/page.tsx`:

1. Add state: `const [editorMode, setEditorMode] = useState<"preview" | "edit">("preview");`
2. Add hook: `const { height: editorHeight, onHandleMouseDown: onHeightDragStart } = useResizableHeight();`
3. In the header buttons area, add an Edit/Preview toggle button:
```tsx
<button
  type="button"
  onClick={() => setEditorMode((m) => m === "preview" ? "edit" : "preview")}
  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50"
>
  {editorMode === "preview" ? "✏️ 编辑" : "👁 预览"}
</button>
```

4. Replace the `<Tabs>` section with conditional rendering:
```tsx
{/* Remove all Tabs imports and JSX */}
{editorMode === "edit" ? (
  <div>
    <div ref={editorWrapperRef} style={{ height: editorHeight, minHeight: 200 }} className="overflow-hidden">
      <NoteEditor
        ref={editorRef}
        value={content}
        onChange={handleContentChange}
        onSelectionChange={handleSelectionChange}
        placeholder="写点什么…"
        className="h-full"
      />
    </div>
    {/* Drag handle */}
    <div
      onMouseDown={onHeightDragStart}
      className="flex h-2 cursor-row-resize items-center justify-center hover:bg-primary/20 transition-colors"
      title="拖拽调整高度"
    >
      <div className="h-0.5 w-12 rounded-full bg-border" />
    </div>
  </div>
) : (
  <div ref={editorWrapperRef}>
    <MarkdownPreview content={content} />
  </div>
)}
```

5. When content changes (via editor), if in preview mode, content state still updates (handleContentChange already sets it). No change needed.
6. Remove `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` imports from page.tsx.

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/client/hooks/useResizableHeight.ts 'app/note/[id]/page.tsx'
git commit -m "feat: editor defaults to preview mode; add resizable height drag handle"
```

---

## Task 5: useSidebarState hook + OutlineNav component

**Files:**
- Create: `src/client/hooks/useSidebarState.ts`
- Create: `src/client/components/layout/OutlineNav.tsx`

**Step 1: Create useSidebarState hook**

```ts
// src/client/hooks/useSidebarState.ts
"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "note-sidebar-collapsed";

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "true";
  });

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(KEY, String(next));
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
```

**Step 2: Create OutlineNav component**

```tsx
// src/client/components/layout/OutlineNav.tsx
"use client";

interface Heading {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

interface OutlineNavProps {
  content: string;
  /** Called when a heading is clicked — scroll target ID */
  onHeadingClick?: (id: string) => void;
}

function parseHeadings(content: string): Heading[] {
  const lines = content.split("\n");
  const headings: Heading[] = [];
  let counter = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      headings.push({
        level: m[1].length as 1 | 2 | 3,
        text: m[2].trim(),
        id: `heading-${counter++}`,
      });
    }
  }
  return headings;
}

export function OutlineNav({ content, onHeadingClick }: OutlineNavProps) {
  const headings = parseHeadings(content);

  if (headings.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        暂无标题，在正文中添加 # 标题即可显示大纲。
      </p>
    );
  }

  return (
    <nav className="px-2 py-2 space-y-0.5">
      {headings.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => onHeadingClick?.(h.id)}
          className={`block w-full truncate rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted hover:text-foreground text-muted-foreground ${
            h.level === 1 ? "font-medium" : h.level === 2 ? "pl-4" : "pl-6 text-[11px]"
          }`}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/client/hooks/useSidebarState.ts src/client/components/layout/OutlineNav.tsx
git commit -m "feat: add useSidebarState hook and OutlineNav component"
```

---

## Task 6: Sidebar component

**Files:**
- Create: `src/client/components/layout/Sidebar.tsx`

**Step 1: Create Sidebar**

```tsx
// src/client/components/layout/Sidebar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { OutlineNav } from "./OutlineNav";
import { useSidebarState } from "@client/hooks/useSidebarState";

interface SidebarProps {
  currentNoteId: string;
  noteContent: string;
  onHeadingClick?: (id: string) => void;
}

export function Sidebar({ currentNoteId, noteContent, onHeadingClick }: SidebarProps) {
  const { collapsed, toggle } = useSidebarState();
  const { notes } = useNotesStore();
  const [tab, setTab] = useState<"notes" | "outline">("notes");
  const [search, setSearch] = useState("");

  const filteredNotes = notes.filter(
    (n) =>
      !n.id.startsWith("local-") ||
      n.title.toLowerCase().includes(search.toLowerCase())
  );

  if (collapsed) {
    return (
      <div className="flex w-8 shrink-0 flex-col items-center border-r border-border bg-muted/30 pt-4">
        <button
          type="button"
          onClick={toggle}
          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="展开侧边栏"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/10">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("notes")}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              tab === "notes"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            笔记
          </button>
          <button
            type="button"
            onClick={() => setTab("outline")}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              tab === "outline"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            大纲
          </button>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="折叠侧边栏"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "notes" ? (
          <div>
            <div className="px-2 pt-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索笔记…"
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <nav className="mt-1 space-y-0.5 px-1 py-1">
              {filteredNotes.map((note) => (
                <Link
                  key={note.id}
                  href={`/note/${note.id}`}
                  className={`block truncate rounded px-2 py-1.5 text-xs transition-colors ${
                    note.id === currentNoteId
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title={note.title || "无标题"}
                >
                  {note.title || "无标题"}
                </Link>
              ))}
              {filteredNotes.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">暂无笔记</p>
              )}
            </nav>
          </div>
        ) : (
          <OutlineNav content={noteContent} onHeadingClick={onHeadingClick} />
        )}
      </div>
    </div>
  );
}
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 3: Commit**

```bash
git add src/client/components/layout/Sidebar.tsx
git commit -m "feat: add Sidebar component with notes list and outline tabs"
```

---

## Task 7: Update AgentChatPanel for collapsible + update page.tsx for 3-column layout

**Files:**
- Modify: `src/client/components/agent/AgentChatPanel.tsx`
- Modify: `app/note/[id]/page.tsx`

**Step 1: Add collapse support to AgentChatPanel**

Add `collapsed` and `onToggleCollapse` props to `AgentChatPanelProps`:

```tsx
export interface AgentChatPanelProps {
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
  selectedText?: string;
  onApplyToEditor?: (content: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}
```

In the panel header, add a collapse button:
```tsx
<button
  type="button"
  onClick={onToggleCollapse}
  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
  title="折叠对话面板"
>
  <ChevronRight className="h-4 w-4" />
</button>
```

**Step 2: Update page.tsx — 3-column layout**

The new layout structure:
```
<div className="flex h-screen overflow-hidden">
  {/* Left: Sidebar */}
  <Sidebar currentNoteId={id} noteContent={content} onHeadingClick={scrollToHeading} />

  {/* Center: Editor area (flex-1) */}
  <div className="flex flex-1 flex-col overflow-y-auto min-w-0">
    ... (existing editor content, no max-w-2xl restriction) ...
  </div>

  {/* Divider (lg only) */}
  {!agentCollapsed && (
    <div className="hidden lg:flex w-1.5 shrink-0 cursor-col-resize ..." onMouseDown={onDividerMouseDown} />
  )}

  {/* Right: Agent Panel (lg only) OR collapsed tab */}
  {agentCollapsed ? (
    <div className="hidden lg:flex w-8 shrink-0 flex-col items-center border-l border-border bg-muted/30 pt-4">
      <button onClick={() => setAgentCollapsed(false)} title="展开对话" className="...">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="mt-4 rotate-90 text-[10px] font-medium text-muted-foreground tracking-widest">AGENT</span>
    </div>
  ) : (
    <div className="hidden border-l border-border lg:flex lg:flex-col shrink-0" style={{ width: panelWidth }}>
      <AgentChatPanel
        noteId={...}
        noteTitle={title}
        noteContent={content}
        selectedText={selectedTextForAgent}
        onApplyToEditor={...}
        collapsed={false}
        onToggleCollapse={() => setAgentCollapsed(true)}
      />
    </div>
  )}
  ...
</div>
```

Add state:
```tsx
const [agentCollapsed, setAgentCollapsed] = useState(() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("agent-panel-collapsed") === "true";
});
// Persist on change
useEffect(() => {
  localStorage.setItem("agent-panel-collapsed", String(agentCollapsed));
}, [agentCollapsed]);
```

For heading scroll (OutlineNav click-to-scroll):
- Since editor uses a textarea (not rendered HTML with IDs), implement `scrollToHeading` by finding the heading text in the editor and scrolling the textarea to that line position, OR in preview mode scroll the MarkdownPreview.
- Simplest approach: parse headings, find line index, scroll editor wrapper's container to that approximate vertical offset.

```tsx
const scrollToHeading = useCallback((headingId: string) => {
  // Parse headings from content to get the index
  const lines = content.split("\n");
  let counter = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,3}\s+/.test(lines[i])) {
      if (`heading-${counter}` === headingId) {
        // Scroll the editor/preview area: find the element with data-heading-idx or approximate by line ratio
        const editorArea = editorWrapperRef.current;
        if (editorArea) {
          const ratio = i / lines.length;
          const scrollParent = editorArea.closest(".overflow-y-auto");
          if (scrollParent) {
            scrollParent.scrollTop = scrollParent.scrollHeight * ratio;
          }
        }
        return;
      }
      counter++;
    }
  }
}, [content]);
```

**Step 3: Add selectedText state for Agent context**

In page.tsx, track selected text for passing to Agent:
```tsx
const [selectedTextForAgent, setSelectedTextForAgent] = useState<string>("");

// Update handleSelectionChange to also set selected text:
const handleSelectionChange = useCallback(() => {
  const range = editorRef.current?.getSelectionRange() ?? null;
  // ... existing position logic ...
  if (range && range.start !== range.end) {
    setSelectedTextForAgent(content.slice(range.start, range.end));
  } else {
    setSelectedTextForAgent("");
  }
}, [content]);
```

**Step 4: Import new components in page.tsx**

```tsx
import { Sidebar } from "@client/components/layout/Sidebar";
import { useResizableHeight } from "@client/hooks/useResizableHeight";
```

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 6: Commit**

```bash
git add src/client/components/agent/AgentChatPanel.tsx 'app/note/[id]/page.tsx'
git commit -m "feat: 3-column layout with collapsible sidebar and agent panel; wire selectedText context"
```

---

## Task 8: Run full test suite and final verification

**Step 1: Install dependencies if not done**

```bash
npm install
```

**Step 2: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass

**Step 3: TypeScript full check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 4: Commit any leftover fixes**

```bash
git status
# If clean, done. Otherwise:
git add -A && git commit -m "fix: resolve remaining TS/lint issues from UX enhancement"
```
