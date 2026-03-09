# Architecture Restructuring & Agent Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Next.js app into three domain layers (client/server/agents), implement local-first note creation with explicit save/cancel editing, and add a rich Document Agent chat panel with left-right split layout.

**Architecture:** The `app/` directory becomes a thin routing layer only; all logic moves into `src/client/` (UI components, state, hooks), `src/server/` (DB, LLM providers, env), and `src/agents/` (agent logic, prompts, tools, conversation manager). The note editing page becomes a two-column layout: editor (left ~65%) + persistent Agent chat panel (right ~35%). Notes are created locally-first (optimistic, temp ID), then persisted on explicit Save.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zustand, shadcn/ui, Tailwind CSS, SQLite (dev) / Firestore (prod), OpenAI / DeepSeek / GML LLM providers, Vitest

---

## Target Directory Structure

```
app/                          ← Next.js routing ONLY (thin layer)
  api/
    notes/route.ts
    notes/[id]/route.ts
    ai/stream/route.ts
    ai/chat/route.ts          ← NEW: agent multi-turn chat
    debug/firestore/route.ts
  note/[id]/page.tsx
  page.tsx
  layout.tsx
  globals.css

src/
  client/
    components/
      notes/
        NoteEditor.tsx        ← moved from components/
        MarkdownPreview.tsx   ← moved
        SelectionAiPopover.tsx← moved
        AiResultModal.tsx     ← moved
      agent/
        AgentChatPanel.tsx    ← NEW
        AgentMessage.tsx      ← NEW
        AgentInput.tsx        ← NEW
      FirestoreNotesSync.tsx  ← moved
      Providers.tsx           ← moved
      ui/                     ← moved from components/ui/
    hooks/
      useUnsavedChanges.ts    ← NEW
    stores/
      useNotesStore.ts        ← moved from stores/

  server/
    notes/
      repository.ts           ← merged: notes-backend + notes-db + notes-firestore
    llm/
      providers/
        openai.ts             ← moved
        deepseek.ts           ← moved
        gml.ts                ← moved
      index.ts                ← moved
      types.ts                ← moved
    db.ts                     ← moved from lib/
    env.ts                    ← moved from lib/
    firebase.ts               ← moved from lib/
    stream-utils.ts           ← moved from lib/
    utils.ts                  ← moved from lib/

  agents/
    document-agent/
      index.ts                ← NEW: agent entry, orchestration
      tools.ts                ← NEW: read-note, search-notes, draft-document tools
      prompts.ts              ← NEW: system prompts
    conversation.ts           ← NEW: multi-turn conversation manager
    types.ts                  ← NEW: AgentMessage, ConversationTurn types

types/
  note.ts                     ← unchanged
  agent.ts                    ← NEW: Agent-specific types
```

---

## Task 1: Update tsconfig.json paths

**Files:**
- Modify: `tsconfig.json`

**Step 1: Add src/* path aliases**

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@client/*": ["./src/client/*"],
      "@server/*": ["./src/server/*"],
      "@agents/*": ["./src/agents/*"]
    }
  }
}
```

**Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add @client/@server/@agents path aliases to tsconfig"
```

---

## Task 2: Move server layer — lib/ → src/server/

**Files:**
- Create: `src/server/db.ts`
- Create: `src/server/env.ts`
- Create: `src/server/firebase.ts`
- Create: `src/server/stream-utils.ts`
- Create: `src/server/utils.ts`
- Create: `src/server/llm/types.ts`
- Create: `src/server/llm/index.ts`
- Create: `src/server/llm/providers/openai.ts`
- Create: `src/server/llm/providers/deepseek.ts`
- Create: `src/server/llm/providers/gml.ts`
- Create: `src/server/notes/repository.ts`

**Step 1: Create directories**

```bash
mkdir -p src/server/llm/providers src/server/notes
```

**Step 2: Copy files with updated internal imports**

For each moved file, copy content verbatim but update all `@/lib/X` imports to `@server/X`:

- `lib/db.ts` → `src/server/db.ts` (no import changes needed, uses `better-sqlite3` directly)
- `lib/env.ts` → `src/server/env.ts` (no import changes)
- `lib/firebase.ts` → `src/server/firebase.ts` (update `@/lib/env` → `@server/env`)
- `lib/stream-utils.ts` → `src/server/stream-utils.ts` (no import changes)
- `lib/utils.ts` → `src/server/utils.ts` (no import changes)
- `lib/llm/types.ts` → `src/server/llm/types.ts` (no import changes)
- `lib/llm/openai.ts` → `src/server/llm/providers/openai.ts` (update `./types` → `../types`, `@/lib/env` → `@server/env`)
- `lib/llm/deepseek.ts` → `src/server/llm/providers/deepseek.ts` (same pattern)
- `lib/llm/gml.ts` → `src/server/llm/providers/gml.ts` (same pattern)
- `lib/llm/index.ts` → `src/server/llm/index.ts` (update `./deepseek` → `./providers/deepseek`, etc., `@/lib/env` → `@server/env`)

**Step 3: Create src/server/notes/repository.ts — merge of notes-backend + notes-db + notes-firestore**

```typescript
/**
 * Notes repository: unified data access layer.
 * Automatically selects Firestore (if configured) or SQLite.
 * Server-side only.
 */
import { getFirestoreInstance } from "@server/firebase";
import * as sqliteNotes from "@server/notes/sqlite";
import * as firestoreNotes from "@server/notes/firestore-adapter";
import type { Note } from "@/types/note";

export type NotesRepository = {
  getAll: () => Promise<Note[]>;
  getById: (id: string) => Promise<Note | null>;
  create: (note: { title?: string; content?: string }) => Promise<Note>;
  update: (id: string, updates: { title?: string; content?: string }) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
};

let _repo: NotesRepository | null = null;

export function getNotesRepository(): NotesRepository {
  if (_repo) return _repo;
  const firestore = getFirestoreInstance();
  if (firestore) {
    _repo = firestoreNotes.makeRepository();
    return _repo;
  }
  if (typeof process !== "undefined" && process.env.VERCEL) {
    throw new Error(
      "Notes backend not available on Vercel: set NEXT_PUBLIC_FIREBASE_* env vars. See docs/DEPLOY.md."
    );
  }
  _repo = sqliteNotes.makeRepository();
  return _repo;
}
```

> Note: Also create `src/server/notes/sqlite.ts` (contents of old `lib/notes-db.ts` but exported as `makeRepository()` factory) and `src/server/notes/firestore-adapter.ts` (contents of old `lib/notes-firestore.ts` as factory).

**Step 4: Run build to confirm no errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing src/server files (old lib/ still exists, so no breakage yet).

**Step 5: Commit**

```bash
git add src/server/
git commit -m "feat(server): create src/server domain layer with llm, notes, db modules"
```

---

## Task 3: Move client layer — components/ + stores/ → src/client/

**Files:**
- Create: `src/client/components/notes/NoteEditor.tsx`
- Create: `src/client/components/notes/MarkdownPreview.tsx`
- Create: `src/client/components/notes/SelectionAiPopover.tsx`
- Create: `src/client/components/notes/AiResultModal.tsx`
- Create: `src/client/components/FirestoreNotesSync.tsx`
- Create: `src/client/components/Providers.tsx`
- Create: `src/client/components/ui/` (all shadcn files)
- Create: `src/client/stores/useNotesStore.ts`

**Step 1: Create directories**

```bash
mkdir -p src/client/components/notes src/client/components/ui src/client/stores src/client/hooks
```

**Step 2: Copy components with updated imports**

For each component, copy content and update imports:
- `@/components/X` → `@client/components/X`
- `@/stores/X` → `@client/stores/X`
- `@/lib/X` → `@server/X` (for stream-utils, etc.)
- `@/types/X` → `@/types/X` (types stay at root, no change)

Files to copy:
- `components/NoteEditor.tsx` → `src/client/components/notes/NoteEditor.tsx`
- `components/MarkdownPreview.tsx` → `src/client/components/notes/MarkdownPreview.tsx`
- `components/SelectionAiPopover.tsx` → `src/client/components/notes/SelectionAiPopover.tsx`
- `components/AiResultModal.tsx` → `src/client/components/notes/AiResultModal.tsx` (update `@/lib/stream-utils` → `@server/stream-utils`)
- `components/FirestoreNotesSync.tsx` → `src/client/components/FirestoreNotesSync.tsx`
- `components/Providers.tsx` → `src/client/components/Providers.tsx`
- `components/ui/*` → `src/client/components/ui/*`
- `stores/useNotesStore.ts` → `src/client/stores/useNotesStore.ts`

**Step 3: Run build check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add src/client/
git commit -m "feat(client): create src/client domain layer with components and stores"
```

---

## Task 4: Update app/ routes to use new src/server imports

**Files:**
- Modify: `app/api/notes/route.ts`
- Modify: `app/api/notes/[id]/route.ts`
- Modify: `app/api/ai/stream/route.ts`
- Modify: `app/api/debug/firestore/route.ts`

**Step 1: Update app/api/notes/route.ts**

Replace:
```typescript
import { getNotesBackend } from "@/lib/notes-backend";
```
With:
```typescript
import { getNotesRepository } from "@server/notes/repository";
```
And replace all `getNotesBackend()` calls with `getNotesRepository()`.

**Step 2: Update app/api/notes/[id]/route.ts**

Same pattern: `@/lib/notes-backend` → `@server/notes/repository`, `getNotesBackend` → `getNotesRepository`.

**Step 3: Update app/api/ai/stream/route.ts**

Replace:
```typescript
import { getGmlKey, getLLMProvider, getOpenAIKey, getDeepSeekKey } from "@/lib/env";
import { streamChat } from "@/lib/llm";
```
With:
```typescript
import { getGmlKey, getLLMProvider, getOpenAIKey, getDeepSeekKey } from "@server/env";
import { streamChat } from "@server/llm";
```

**Step 4: Update app/api/debug/firestore/route.ts**

Update any `@/lib/` imports to `@server/`.

**Step 5: Update app/ pages imports**

In `app/note/[id]/page.tsx` and `app/page.tsx`, update:
- `@/components/X` → `@client/components/notes/X` or `@client/components/X`
- `@/stores/X` → `@client/stores/X`

In `app/layout.tsx`, update:
- `@/components/Providers` → `@client/components/Providers`
- `@/components/FirestoreNotesSync` → `@client/components/FirestoreNotesSync`

**Step 6: Verify build**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 7: Run existing tests**

```bash
npx vitest run
```

Expected: all passing.

**Step 8: Commit**

```bash
git add app/
git commit -m "refactor: update app/ routing layer to use new @server and @client imports"
```

---

## Task 5: Delete old directories (lib/, components/, stores/)

**Step 1: Remove old directories**

```bash
rm -rf lib/ components/ stores/
```

**Step 2: Verify build still passes**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, all tests passing.

**Step 3: Update __tests__/ imports**

The existing tests in `__tests__/` reference old paths. Update:
- `__tests__/components/AiResultModal.test.tsx` → update imports to `@client/components/notes/AiResultModal`
- `__tests__/lib/stream-utils.test.ts` → update imports to `@server/stream-utils`

**Step 4: Run tests again**

```bash
npx vitest run
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove old lib/, components/, stores/ directories after migration"
```

---

## Task 6: Add Agent types

**Files:**
- Create: `types/agent.ts`
- Create: `src/agents/types.ts`

**Step 1: Write types/agent.ts**

```typescript
/** Agent chat message (client-side) */
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** Conversation session */
export interface AgentConversation {
  id: string;
  noteId: string | null;
  messages: AgentMessage[];
}
```

**Step 2: Write src/agents/types.ts**

```typescript
import type { ChatMessage } from "@server/llm/types";

/** Internal agent turn — includes tool calls if any */
export interface AgentTurn {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export interface AgentContext {
  noteId: string | null;
  noteContent: string | null;
  noteTitle: string | null;
}

export { ChatMessage };
```

**Step 3: Commit**

```bash
git add types/agent.ts src/agents/types.ts
git commit -m "feat(agents): add agent and conversation types"
```

---

## Task 7: Create Document Agent prompts and tools

**Files:**
- Create: `src/agents/document-agent/prompts.ts`
- Create: `src/agents/document-agent/tools.ts`

**Step 1: Write src/agents/document-agent/prompts.ts**

```typescript
export const DOCUMENT_AGENT_SYSTEM = `You are a smart note-taking assistant with three capabilities:

1. **Note Context** — You always have access to the user's current note (title + content). Reference it directly when answering questions about it.
2. **Knowledge Search** — When the user asks something that might be in their other notes, use the search_notes tool to find relevant notes.
3. **Document Drafting** — When the user asks you to draft, outline, or structure a document, use the draft_document tool to produce a well-structured template.

Always respond in the same language the user uses.
Keep responses concise. When inserting content, produce clean Markdown.`;

export const DRAFT_TEMPLATES: Record<string, string> = {
  meeting: `# Meeting Notes — {date}

## Attendees
-

## Agenda
1.

## Discussion
###

## Action Items
- [ ]

## Next Meeting
`,
  tech: `# {title}

## Overview

## Background

## Design

## Implementation

## Testing

## Open Questions
`,
  weekly: `# Weekly Review — {date}

## Completed This Week
-

## In Progress
-

## Blockers
-

## Next Week
-
`,
};
```

**Step 2: Write src/agents/document-agent/tools.ts**

```typescript
import type { Note } from "@/types/note";

export type ToolResult = { content: string; error?: string };

/**
 * Returns the full content of the current note as tool context.
 */
export function readCurrentNote(note: { title: string; content: string } | null): ToolResult {
  if (!note) return { content: "No note is currently open.", error: "no_note" };
  return {
    content: `Title: ${note.title || "(untitled)"}\n\nContent:\n${note.content || "(empty)"}`,
  };
}

/**
 * Simple keyword search across all notes. Returns top-3 matches by occurrence count.
 * In a production system this would be replaced by vector similarity search.
 */
export function searchNotes(query: string, notes: Note[]): ToolResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = notes.map((n) => {
    const text = `${n.title} ${n.content}`.toLowerCase();
    const score = terms.reduce((acc, t) => {
      const matches = (text.match(new RegExp(t, "g")) ?? []).length;
      return acc + matches;
    }, 0);
    return { note: n, score };
  });
  const results = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!results.length) return { content: "No relevant notes found." };

  const formatted = results
    .map((r) => `### ${r.note.title || "(untitled)"}\n${r.note.content.slice(0, 300)}${r.note.content.length > 300 ? "…" : ""}`)
    .join("\n\n---\n\n");
  return { content: `Found ${results.length} relevant note(s):\n\n${formatted}` };
}

/**
 * Returns a document template filled with basic date/title placeholders.
 */
export function draftDocument(templateKey: string, title: string, templates: Record<string, string>): ToolResult {
  const template = templates[templateKey] ?? templates["tech"];
  const date = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  const filled = template
    .replace("{date}", date)
    .replace("{title}", title || "文档标题");
  return { content: filled };
}
```

**Step 3: Commit**

```bash
git add src/agents/document-agent/
git commit -m "feat(agents): add document agent prompts and tools (note context, search, draft)"
```

---

## Task 8: Create Agent conversation manager

**Files:**
- Create: `src/agents/conversation.ts`

**Step 1: Write src/agents/conversation.ts**

```typescript
import type { ChatMessage } from "@server/llm/types";
import type { AgentContext } from "@agents/types";
import { DOCUMENT_AGENT_SYSTEM, DRAFT_TEMPLATES } from "./document-agent/prompts";
import { readCurrentNote, searchNotes, draftDocument } from "./document-agent/tools";
import type { Note } from "@/types/note";

export interface ConversationRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: AgentContext;
  allNotes: Note[];
}

/**
 * Builds the full message array to send to the LLM, injecting:
 *   - System prompt with agent capabilities
 *   - Current note context (if available)
 *   - Tool results for recognized tool invocations in the last user message
 */
export function buildAgentMessages(req: ConversationRequest): ChatMessage[] {
  const { messages, context, allNotes } = req;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.content?.toLowerCase() ?? "";

  // Resolve tool context
  const toolContextParts: string[] = [];

  // Always inject current note context
  if (context.noteContent !== null) {
    const noteResult = readCurrentNote({
      title: context.noteTitle ?? "",
      content: context.noteContent,
    });
    toolContextParts.push(`[Current Note]\n${noteResult.content}`);
  }

  // Search notes if user seems to be asking about other notes
  const searchTriggers = ["搜索", "查找", "找到", "其他笔记", "search", "find", "other notes"];
  if (searchTriggers.some((t) => userText.includes(t)) && lastUserMsg) {
    const searchResult = searchNotes(lastUserMsg.content, allNotes);
    if (!searchResult.error) {
      toolContextParts.push(`[Search Results]\n${searchResult.content}`);
    }
  }

  // Draft document if user asks to draft
  const draftTriggers = ["起草", "草稿", "模板", "draft", "template", "outline"];
  if (draftTriggers.some((t) => userText.includes(t)) && lastUserMsg) {
    const templateKey = userText.includes("会议") || userText.includes("meeting")
      ? "meeting"
      : userText.includes("周报") || userText.includes("weekly")
      ? "weekly"
      : "tech";
    const draftResult = draftDocument(templateKey, context.noteTitle ?? "", DRAFT_TEMPLATES);
    toolContextParts.push(`[Document Draft]\n${draftResult.content}`);
  }

  const systemContent = [
    DOCUMENT_AGENT_SYSTEM,
    ...(toolContextParts.length ? ["\n---\n" + toolContextParts.join("\n\n")] : []),
  ].join("\n");

  return [
    { role: "system", content: systemContent },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];
}
```

**Step 2: Commit**

```bash
git add src/agents/conversation.ts
git commit -m "feat(agents): add conversation manager with tool injection"
```

---

## Task 9: Create /api/ai/chat route

**Files:**
- Create: `app/api/ai/chat/route.ts`

**Step 1: Write app/api/ai/chat/route.ts**

```typescript
/**
 * POST /api/ai/chat — Agent multi-turn chat with note context.
 * Body: {
 *   messages: Array<{ role: "user"|"assistant", content: string }>,
 *   noteId?: string,
 *   noteContent?: string,
 *   noteTitle?: string,
 *   allNotes?: Array<{ id, title, content, createdAt, updatedAt }>
 * }
 * Streams back SSE text/event-stream.
 */
import { NextRequest } from "next/server";
import { streamChat } from "@server/llm";
import { buildAgentMessages } from "@agents/conversation";
import type { AgentContext } from "@agents/types";
import type { Note } from "@/types/note";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      return Response.json({ error: "messages array is required" }, { status: 400 });
    }

    const context: AgentContext = {
      noteId: body.noteId ?? null,
      noteContent: typeof body.noteContent === "string" ? body.noteContent : null,
      noteTitle: typeof body.noteTitle === "string" ? body.noteTitle : null,
    };

    const allNotes: Note[] = Array.isArray(body.allNotes) ? body.allNotes : [];

    const llmMessages = buildAgentMessages({ messages, context, allNotes });

    const stream = await streamChat(llmMessages, undefined);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Verify build**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/api/ai/chat/
git commit -m "feat(api): add /api/ai/chat agent multi-turn streaming endpoint"
```

---

## Task 10: Local-first note creation — update Zustand store

**Files:**
- Modify: `src/client/stores/useNotesStore.ts`

**Step 1: Add local draft support**

Add a `createLocalDraft` action that creates a temp note in-memory with a `local-` prefixed ID, and a `syncDraft` action that persists it to the API and replaces the temp note:

```typescript
import { create } from "zustand";
import type { Note } from "@/types/note";

interface NotesState {
  notes: Note[];
  currentId: string | null;
}

interface NotesActions {
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Pick<Note, "title" | "content" | "updatedAt">>) => void;
  deleteNote: (id: string) => void;
  setCurrentId: (id: string | null) => void;
  fetchNotes: () => Promise<void>;
  /** Creates a local-only draft note (no API call). Returns the draft note. */
  createLocalDraft: () => Note;
  /** Persists a local draft to the API. Returns the saved note or null on error. */
  syncDraft: (draftId: string) => Promise<Note | null>;
}

type NotesStore = NotesState & NotesActions;

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],
  currentId: null,

  setNotes: (notes) => set({ notes }),

  addNote: (note) =>
    set((state) => ({ notes: [...state.notes, note] })),

  updateNote: (id, updates) =>
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    })),

  deleteNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      currentId: state.currentId === id ? null : state.currentId,
    })),

  setCurrentId: (id) => set({ currentId: id }),

  fetchNotes: async () => {
    const res = await fetch("/api/notes");
    const data = await res.json();
    set({ notes: res.ok ? data : [] });
  },

  createLocalDraft: () => {
    const now = new Date().toISOString();
    const draft: Note = {
      id: `local-${Date.now()}`,
      title: "",
      content: "",
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ notes: [...state.notes, draft] }));
    return draft;
  },

  syncDraft: async (draftId: string) => {
    const draft = get().notes.find((n) => n.id === draftId);
    if (!draft) return null;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, content: draft.content }),
      });
      if (!res.ok) return null;
      const saved = (await res.json()) as Note;
      // Replace local draft with persisted note
      set((state) => ({
        notes: state.notes.map((n) => (n.id === draftId ? saved : n)),
      }));
      return saved;
    } catch {
      return null;
    }
  },
}));
```

**Step 2: Commit**

```bash
git add src/client/stores/useNotesStore.ts
git commit -m "feat(store): add createLocalDraft and syncDraft for local-first note creation"
```

---

## Task 11: Local-first note creation — update home page

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update handleNewNote to use local-first**

Replace the `handleNewNote` function:

```typescript
async function handleNewNote() {
  const draft = createLocalDraft();
  router.push(`/note/${draft.id}`);
}
```

Remove the `creating` state (no longer needed). The button becomes:

```tsx
<button
  type="button"
  onClick={handleNewNote}
  className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90 sm:w-auto"
>
  新建笔记
</button>
```

Also update imports:
```typescript
const { notes, fetchNotes, createLocalDraft } = useNotesStore();
```

**Step 2: Verify note list doesn't show local drafts**

Add a filter to hide local drafts from the list (they're shown only while editing):

```typescript
const persistedNotes = notes.filter((n) => !n.id.startsWith("local-"));
```

Use `persistedNotes` in the render loop instead of `notes`.

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ux): local-first note creation — no API call on new note button"
```

---

## Task 12: Add useUnsavedChanges hook

**Files:**
- Create: `src/client/hooks/useUnsavedChanges.ts`

**Step 1: Write the hook**

```typescript
"use client";

import { useEffect } from "react";

/**
 * Warns the user before closing/refreshing the tab when there are unsaved changes.
 * For in-app navigation, call the returned `confirmLeave` before routing.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
```

**Step 2: Commit**

```bash
git add src/client/hooks/useUnsavedChanges.ts
git commit -m "feat(hooks): add useUnsavedChanges hook for unsaved state warning"
```

---

## Task 13: Explicit save/cancel editing — refactor note detail page

**Files:**
- Modify: `app/note/[id]/page.tsx`

This task is the largest refactor. The key behavioral changes:

1. `title` and `content` are **local state** only — no auto-save on debounce.
2. A `isDirty` flag tracks whether local state differs from the server state.
3. **Save** button: calls `PUT /api/notes/:id` with current title + content, then clears `isDirty`.
4. **Cancel** button: resets local state to the last saved version, clears `isDirty`.
5. For a **local draft** (id starts with `local-`), Save calls `syncDraft` (which creates via POST), then replaces the URL with the real ID via `router.replace`.
6. `useUnsavedChanges(isDirty)` warns on tab close.

**Step 1: Remove all auto-save logic**

Delete:
- `saveTitle` callback
- `saveContent` callback
- `handleTitleChange` debounce logic
- `handleTitleBlur` flush logic
- `titleDebounceRef`
- `onSave` prop from `NoteEditor`

**Step 2: Add save/cancel handlers**

```typescript
const [isDirty, setIsDirty] = useState(false);

// Track dirty state
const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setTitle(e.target.value);
  setIsDirty(true);
};

const handleContentChange = (val: string) => {
  setContent(val);
  setIsDirty(true);
};

async function handleSave() {
  if (!isDirty) return;
  setSaving(true);
  try {
    // Local draft: create via POST first
    if (id.startsWith("local-")) {
      const saved = await syncDraft(id);
      if (saved) {
        setIsDirty(false);
        router.replace(`/note/${saved.id}`);
      }
      return;
    }
    const res = await fetch(`/api/notes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    if (res.ok) {
      const data = await res.json() as Note;
      updateNote(id, { title: data.title, content: data.content, updatedAt: data.updatedAt });
      setIsDirty(false);
    }
  } finally {
    setSaving(false);
  }
}

function handleCancel() {
  // Reset to last known server state
  const serverNote = notes.find((n) => n.id === id) ?? note;
  if (serverNote) {
    setTitle(serverNote.title);
    setContent(serverNote.content);
  }
  setIsDirty(false);
}
```

**Step 3: Update header buttons**

```tsx
<div className="flex items-center gap-2">
  {isDirty && (
    <>
      <button onClick={handleCancel} className="... cancel-style ...">取消</button>
      <button onClick={handleSave} disabled={saving} className="... save-style ...">
        {saving ? "保存中…" : "保存"}
      </button>
    </>
  )}
  <button onClick={() => handleAiProcess()} className="...">AI 处理</button>
  <button onClick={() => setDeleteDialogOpen(true)} className="... delete-style ...">删除笔记</button>
</div>
```

**Step 4: Add useUnsavedChanges**

```typescript
import { useUnsavedChanges } from "@client/hooks/useUnsavedChanges";
// ...
useUnsavedChanges(isDirty);
```

**Step 5: Commit**

```bash
git add app/note/
git commit -m "feat(ux): explicit save/cancel for note editing — no more auto-save blocking"
```

---

## Task 14: Redesign note detail page — left-right split layout

**Files:**
- Modify: `app/note/[id]/page.tsx`

**Step 1: Wrap the page in a flex container**

Replace the outer `div` structure with a two-column layout:

```tsx
return (
  <div className="flex h-screen overflow-hidden bg-background text-foreground">
    {/* Left column: editor */}
    <div className="flex flex-1 flex-col overflow-y-auto min-w-0">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-5 sm:py-8">
        {/* header, title input, tabs/editor */}
      </div>
    </div>

    {/* Right column: agent chat */}
    <div className="hidden w-[380px] shrink-0 border-l border-border lg:flex lg:flex-col">
      <AgentChatPanel
        noteId={id}
        noteTitle={title}
        noteContent={content}
      />
    </div>
  </div>
);
```

> The agent panel is hidden on small screens (`hidden lg:flex`). Editor takes all remaining space on small screens.

**Step 2: Remove max-width constraint on the page wrapper**

The old `max-w-2xl mx-auto` should apply only to the editor column, not the whole page.

**Step 3: Verify layout renders correctly on localhost**

```bash
npm run dev
```

Open http://localhost:3000/note/[any-id] and verify the split layout.

**Step 4: Commit**

```bash
git add app/note/
git commit -m "feat(layout): left-right split — editor left, agent chat panel right"
```

---

## Task 15: Create AgentInput component

**Files:**
- Create: `src/client/components/agent/AgentInput.tsx`

**Step 1: Write AgentInput.tsx**

```typescript
"use client";

import { useRef, useState } from "react";
import { Button } from "@client/components/ui/button";

export interface AgentInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function AgentInput({ onSend, disabled }: AgentInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="问问 Agent… (Enter 发送, Shift+Enter 换行)"
        rows={2}
        className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      <Button type="button" size="sm" onClick={handleSend} disabled={disabled || !text.trim()}>
        发送
      </Button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/client/components/agent/AgentInput.tsx
git commit -m "feat(ui): add AgentInput component"
```

---

## Task 16: Create AgentMessage component

**Files:**
- Create: `src/client/components/agent/AgentMessage.tsx`

**Step 1: Write AgentMessage.tsx**

```typescript
"use client";

import type { AgentMessage as AgentMessageType } from "@/types/agent";
import { MarkdownPreview } from "@client/components/notes/MarkdownPreview";

export function AgentMessage({ message }: { message: AgentMessageType }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-foreground text-background"
            : "bg-muted text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownPreview content={message.content} />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/client/components/agent/AgentMessage.tsx
git commit -m "feat(ui): add AgentMessage component with markdown rendering"
```

---

## Task 17: Create AgentChatPanel component

**Files:**
- Create: `src/client/components/agent/AgentChatPanel.tsx`

**Step 1: Write AgentChatPanel.tsx**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import { parseChunk } from "@server/stream-utils";
import type { AgentMessage as AgentMessageType } from "@/types/agent";

export interface AgentChatPanelProps {
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
}

export function AgentChatPanel({ noteId, noteTitle, noteContent }: AgentChatPanelProps) {
  const { notes } = useNotesStore();
  const [messages, setMessages] = useState<AgentMessageType[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(
    async (userText: string) => {
      const userMsg: AgentMessageType = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: userText,
        createdAt: new Date().toISOString(),
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setStreaming(true);

      // Placeholder for streaming assistant response
      const assistantId = `msg-${Date.now() + 1}`;
      const assistantMsg: AgentMessageType = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            noteId,
            noteTitle,
            noteContent,
            allNotes: notes.filter((n) => !n.id.startsWith("local-")),
          }),
        });

        if (!res.ok || !res.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "请求失败，请重试。" }
                : m
            )
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              const text = parseChunk(part);
              if (text) {
                accumulated += text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m
                  )
                );
              }
            }
          }
          if (done) break;
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "请求出错，请重试。" } : m
          )
        );
      } finally {
        setStreaming(false);
      }
    },
    [messages, noteId, noteTitle, noteContent, notes]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Agent 对话</h2>
        <button
          type="button"
          onClick={() => setMessages([])}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          清空
        </button>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground mt-8">
            问问 Agent 关于这篇笔记的问题，或者搜索其他笔记，或者让它帮你起草文档。
          </p>
        ) : (
          messages.map((m) => <AgentMessage key={m.id} message={m} />)
        )}
      </div>

      {/* Input */}
      <AgentInput onSend={sendMessage} disabled={streaming} />
    </div>
  );
}
```

**Step 2: Verify build**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/client/components/agent/
git commit -m "feat(ui): add AgentChatPanel with streaming conversation support"
```

---

## Task 18: Wire AgentChatPanel into note detail page

**Files:**
- Modify: `app/note/[id]/page.tsx`

**Step 1: Add import**

```typescript
import { AgentChatPanel } from "@client/components/agent/AgentChatPanel";
```

**Step 2: Confirm it's already in the layout from Task 14**

The `<AgentChatPanel noteId={id} noteTitle={title} noteContent={content} />` should already be in the right column from Task 14.

**Step 3: Verify the integration end-to-end on localhost**

```bash
npm run dev
```

Steps to test:
1. Open a note
2. Verify the split layout (editor left, chat right)
3. Type a message in the Agent input and press Enter
4. Verify the streaming response appears in the chat

**Step 4: Commit**

```bash
git add app/note/
git commit -m "feat: wire AgentChatPanel into note detail page"
```

---

## Task 19: Update tests for new import paths

**Files:**
- Modify: `__tests__/components/AiResultModal.test.tsx`
- Modify: `__tests__/lib/stream-utils.test.ts`

**Step 1: Update AiResultModal.test.tsx imports**

```typescript
// Old:
import { AiResultModal } from "@/components/AiResultModal";
// New:
import { AiResultModal } from "@client/components/notes/AiResultModal";
```

**Step 2: Update stream-utils.test.ts imports**

```typescript
// Old:
import { parseChunk } from "@/lib/stream-utils";
// New:
import { parseChunk } from "@server/stream-utils";
```

**Step 3: Add vitest.config.mts path aliases**

In `vitest.config.mts`, add the same path aliases used in tsconfig:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@client": path.resolve(__dirname, "src/client"),
      "@server": path.resolve(__dirname, "src/server"),
      "@agents": path.resolve(__dirname, "src/agents"),
    },
  },
  // ... rest of config
});
```

**Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests passing.

**Step 5: Commit**

```bash
git add __tests__/ vitest.config.mts
git commit -m "test: update import paths to match new domain layer structure"
```

---

## Task 20: Write tests for new agent functionality

**Files:**
- Create: `__tests__/agents/tools.test.ts`
- Create: `__tests__/agents/conversation.test.ts`

**Step 1: Write __tests__/agents/tools.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import { readCurrentNote, searchNotes, draftDocument } from "@agents/document-agent/tools";
import { DRAFT_TEMPLATES } from "@agents/document-agent/prompts";
import type { Note } from "@/types/note";

const makeNote = (id: string, title: string, content: string): Note => ({
  id, title, content,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("readCurrentNote", () => {
  it("returns note title and content", () => {
    const result = readCurrentNote({ title: "Test", content: "Hello world" });
    expect(result.content).toContain("Test");
    expect(result.content).toContain("Hello world");
  });

  it("returns error when no note", () => {
    const result = readCurrentNote(null);
    expect(result.error).toBe("no_note");
  });
});

describe("searchNotes", () => {
  const notes = [
    makeNote("1", "React hooks", "useState useEffect custom hooks"),
    makeNote("2", "Vue composition", "ref reactive computed"),
    makeNote("3", "TypeScript", "types interfaces generics"),
  ];

  it("finds relevant notes by keyword", () => {
    const result = searchNotes("hooks useState", notes);
    expect(result.content).toContain("React hooks");
  });

  it("returns no results for unmatched query", () => {
    const result = searchNotes("python django flask", notes);
    expect(result.content).toContain("No relevant notes");
  });

  it("returns at most 3 results", () => {
    const manyNotes = Array.from({ length: 10 }, (_, i) =>
      makeNote(String(i), `Note ${i}`, "common keyword here")
    );
    const result = searchNotes("common keyword", manyNotes);
    const count = (result.content.match(/###/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(3);
  });
});

describe("draftDocument", () => {
  it("produces meeting template", () => {
    const result = draftDocument("meeting", "Team Sync", DRAFT_TEMPLATES);
    expect(result.content).toContain("Meeting Notes");
    expect(result.content).toContain("Attendees");
  });

  it("falls back to tech template for unknown key", () => {
    const result = draftDocument("unknown", "My Doc", DRAFT_TEMPLATES);
    expect(result.content).toContain("My Doc");
  });
});
```

**Step 2: Run tests to confirm they pass**

```bash
npx vitest run __tests__/agents/
```

Expected: all passing.

**Step 3: Commit**

```bash
git add __tests__/agents/
git commit -m "test: add unit tests for agent tools (readCurrentNote, searchNotes, draftDocument)"
```

---

## Task 21: Final build verification and cleanup

**Step 1: Run full build**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: 0 TypeScript errors, all tests passing, build succeeds.

**Step 2: Verify dev server end-to-end**

```bash
npm run dev
```

Test checklist:
- [ ] Home page loads, note list shows
- [ ] "新建笔记" button creates note instantly (no lag), redirects to editor
- [ ] Note editor shows Save/Cancel buttons only when there are changes
- [ ] Save button persists note to API, `isDirty` clears
- [ ] Cancel button restores last saved state
- [ ] For a new local draft, Save button creates the note via POST and redirects to real ID
- [ ] Left-right split layout visible on desktop (≥1024px)
- [ ] Agent chat panel shows on right side
- [ ] Sending a message in agent panel streams a response
- [ ] Agent response references current note content
- [ ] Asking about other notes triggers search results in context
- [ ] Asking to draft a document returns a markdown template
- [ ] Existing Selection AI popover still works (text selection → AI actions)

**Step 3: Commit final state**

```bash
git add -A
git commit -m "feat: complete architecture restructuring and agent chat implementation"
```

---

## Summary of Changes

| Area | Before | After |
|---|---|---|
| File organization | Flat `lib/`, `components/`, `stores/` | Domain layers: `src/client/`, `src/server/`, `src/agents/` |
| Note creation | API call on click (blocking) | Local-first with temp ID, immediate navigation |
| Note editing | Auto-save with 500ms debounce | Explicit Save / Cancel buttons |
| Note detail layout | Single-column max-w-2xl | Left-right split: editor + agent panel |
| AI features | One-shot text processing (modal) | Multi-turn agent chat + one-shot processing (both) |
| Agent capabilities | Polish / rewrite / summarize / expand / translate | + current note context + cross-note search + document drafting |
