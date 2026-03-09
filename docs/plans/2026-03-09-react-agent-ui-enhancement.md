# ReAct Agent + UI Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the Document Agent from a keyword-matching prompt builder to a proper ReAct loop, and enhance the UI with resizable panel, rich thought/action display, smart tooltip positioning, and mobile full-screen chat.

**Architecture:**
- **Phase 1 (Agent):** Replace `src/agents/conversation.ts` with a ReAct loop engine. Each turn: LLM emits `<Thought>`, `<Action toolName="...">`, then we execute the tool and inject `<Observation>`, loop until `<Answer>`. The SSE stream carries structured events (`thought`, `action`, `observation`, `answer`) so the frontend can render each step distinctly.
- **Phase 2 (UI):** Enhance `AgentChatPanel` to render thought/action/observation cards inline, add a drag-resizable panel divider, smart tooltip on selection, and a full-screen modal for mobile.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zustand, Tailwind CSS v4, shadcn/ui, Vitest

---

## Phase 1: ReAct Agent Architecture

### Task 1: Define ReAct types

**Files:**
- Modify: `src/agents/types.ts`
- Modify: `types/agent.ts`

**Step 1: Update `src/agents/types.ts`**

Replace the entire file with:

```typescript
import type { ChatMessage } from "@server/llm/types";

/** A single step emitted by the ReAct loop */
export type ReActStep =
  | { type: "thought"; content: string }
  | { type: "action"; toolName: string; toolInput: string }
  | { type: "observation"; toolName: string; content: string }
  | { type: "answer"; content: string }
  | { type: "error"; content: string };

/** Serialised form sent over SSE */
export interface ReActEvent {
  event: ReActStep["type"];
  data: string;           // JSON-encoded payload
}

export interface AgentContext {
  noteId: string | null;
  noteContent: string | null;
  noteTitle: string | null;
}

export type { ChatMessage };
```

**Step 2: Update `types/agent.ts` to add step rendering info**

```typescript
/** A single step in an Agent turn (rendered in the UI) */
export interface AgentStep {
  type: "thought" | "action" | "observation" | "answer" | "error";
  content: string;
  toolName?: string;
}

/** Agent chat message (client-side) */
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  /** Final answer text (assistant only) */
  content: string;
  /** Intermediate steps (assistant only) */
  steps?: AgentStep[];
  createdAt: string;
}

/** Conversation session */
export interface AgentConversation {
  id: string;
  noteId: string | null;
  messages: AgentMessage[];
}
```

**Step 3: Run TypeScript check**

```bash
cd .worktrees/feature-react-agent
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only for files we haven't updated yet (steps 2-N)

**Step 4: Commit**

```bash
git add src/agents/types.ts types/agent.ts
git commit -m "feat(agent): add ReAct step types and enrich AgentMessage"
```

---

### Task 2: Implement the ReAct tool registry

**Files:**
- Modify: `src/agents/document-agent/tools.ts`
- Create: `src/agents/tool-registry.ts`

**Step 1: Write failing test**

Create `__tests__/agents/tool-registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { executeAgentTool, AGENT_TOOLS } from "@agents/tool-registry";
import type { Note } from "@/types/note";

const note = { title: "测试", content: "React Hooks 介绍" };
const notes: Note[] = [
  { id: "1", title: "React", content: "useState useEffect", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
];

describe("AGENT_TOOLS", () => {
  it("exports read_note, search_notes, draft_document", () => {
    expect(AGENT_TOOLS.map((t) => t.name)).toEqual(
      expect.arrayContaining(["read_note", "search_notes", "draft_document"])
    );
  });
});

describe("executeAgentTool", () => {
  it("read_note returns note content", async () => {
    const result = await executeAgentTool("read_note", "{}", note, notes);
    expect(result).toContain("测试");
    expect(result).toContain("React Hooks");
  });

  it("search_notes finds matching notes", async () => {
    const result = await executeAgentTool(
      "search_notes",
      JSON.stringify({ query: "useState" }),
      note,
      notes
    );
    expect(result).toContain("React");
  });

  it("draft_document returns a template", async () => {
    const result = await executeAgentTool(
      "draft_document",
      JSON.stringify({ template: "meeting", title: "周例会" }),
      note,
      notes
    );
    expect(result).toContain("会议纪要");
    expect(result).toContain("周例会");
  });

  it("unknown tool returns error string", async () => {
    const result = await executeAgentTool("unknown_tool", "{}", note, notes);
    expect(result).toContain("未知工具");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd .worktrees/feature-react-agent
npx vitest run __tests__/agents/tool-registry.test.ts 2>&1 | tail -15
```

Expected: FAIL — module not found

**Step 3: Create `src/agents/tool-registry.ts`**

```typescript
import { readCurrentNote, searchNotes, draftDocument } from "./document-agent/tools";
import { DRAFT_TEMPLATES } from "./document-agent/prompts";
import type { Note } from "@/types/note";

export interface AgentTool {
  name: string;
  description: string;
  parametersSchema: string; // JSON Schema string for LLM prompt
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "read_note",
    description: "读取当前打开的笔记的完整标题和正文内容。无需参数。",
    parametersSchema: "{}",
  },
  {
    name: "search_notes",
    description: "在用户所有笔记中关键词搜索，返回最相关的前 3 篇。参数：{ query: string }",
    parametersSchema: '{"query":"string"}',
  },
  {
    name: "draft_document",
    description:
      "根据模板生成文档草稿。参数：{ template: 'meeting'|'tech'|'weekly', title: string }",
    parametersSchema: '{"template":"meeting|tech|weekly","title":"string"}',
  },
];

type NoteContext = { title: string; content: string } | null;

/**
 * Execute a named tool and return the observation string.
 */
export async function executeAgentTool(
  toolName: string,
  toolInputJson: string,
  noteContext: NoteContext,
  allNotes: Note[]
): Promise<string> {
  let input: Record<string, string> = {};
  try {
    input = JSON.parse(toolInputJson);
  } catch {
    // ignore parse errors, treat as empty input
  }

  switch (toolName) {
    case "read_note": {
      const result = readCurrentNote(noteContext);
      return result.content;
    }
    case "search_notes": {
      const result = searchNotes(input.query ?? "", allNotes);
      return result.content;
    }
    case "draft_document": {
      const result = draftDocument(
        input.template ?? "tech",
        input.title ?? "",
        DRAFT_TEMPLATES
      );
      return result.content;
    }
    default:
      return `未知工具: ${toolName}`;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/agents/tool-registry.test.ts 2>&1 | tail -10
```

Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add src/agents/tool-registry.ts __tests__/agents/tool-registry.test.ts
git commit -m "feat(agent): add tool registry with executeAgentTool"
```

---

### Task 3: Implement the ReAct engine

**Files:**
- Create: `src/agents/react-engine.ts`

**Step 1: Write failing test**

Create `__tests__/agents/react-engine.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { parseReActResponse, buildReActSystemPrompt } from "@agents/react-engine";
import { AGENT_TOOLS } from "@agents/tool-registry";

describe("parseReActResponse", () => {
  it("parses a Thought block", () => {
    const text = "<Thought>需要先读取笔记内容</Thought>";
    const steps = parseReActResponse(text);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ type: "thought", content: "需要先读取笔记内容" });
  });

  it("parses an Action block", () => {
    const text = '<Action tool="read_note">{}</Action>';
    const steps = parseReActResponse(text);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "action", toolName: "read_note" });
  });

  it("parses an Answer block", () => {
    const text = "<Answer>这是最终答案</Answer>";
    const steps = parseReActResponse(text);
    expect(steps[0]).toEqual({ type: "answer", content: "这是最终答案" });
  });

  it("parses multiple blocks in sequence", () => {
    const text = `<Thought>思考中</Thought>\n<Action tool="search_notes">{"query":"React"}</Action>`;
    const steps = parseReActResponse(text);
    expect(steps).toHaveLength(2);
    expect(steps[0].type).toBe("thought");
    expect(steps[1].type).toBe("action");
  });

  it("falls back to answer for plain text", () => {
    const steps = parseReActResponse("这是直接回答");
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ type: "answer", content: "这是直接回答" });
  });
});

describe("buildReActSystemPrompt", () => {
  it("includes tool names in the system prompt", () => {
    const prompt = buildReActSystemPrompt(AGENT_TOOLS);
    expect(prompt).toContain("read_note");
    expect(prompt).toContain("search_notes");
    expect(prompt).toContain("draft_document");
  });

  it("includes XML format instructions", () => {
    const prompt = buildReActSystemPrompt(AGENT_TOOLS);
    expect(prompt).toContain("<Thought>");
    expect(prompt).toContain("<Action");
    expect(prompt).toContain("<Answer>");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/agents/react-engine.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found

**Step 3: Create `src/agents/react-engine.ts`**

```typescript
import type { AgentTool } from "./tool-registry";
import type { ReActStep } from "./types";

/**
 * Build the ReAct system prompt that instructs the LLM to use XML tags.
 */
export function buildReActSystemPrompt(tools: AgentTool[]): string {
  const toolDocs = tools
    .map((t) => `- **${t.name}**: ${t.description}\n  参数格式: ${t.parametersSchema}`)
    .join("\n");

  return `你是一个智能文档笔记助手，拥有以下工具可以调用：

${toolDocs}

**回复格式规则（严格遵守）：**
每次回复时，你必须按照以下 XML 格式进行推理和行动：

<Thought>在这里写下你的推理过程，分析用户意图，决定是否调用工具</Thought>
<Action tool="工具名称">{"参数": "值"}</Action>

收到工具结果后，继续推理：
<Thought>根据观察结果进一步推理</Thought>
<Answer>当你有足够信息时，在这里给出最终回答。支持 Markdown 格式。</Answer>

**规则：**
- 必须先输出 <Thought> 再决定是否调用工具
- 如果不需要工具，直接输出 <Thought> 后跟 <Answer>
- <Action> 中的内容必须是合法 JSON
- <Answer> 是对话的终点，出现后本轮结束
- 回复语言与用户保持一致`;
}

/** Parsed ReAct step from LLM output */
export type ParsedStep =
  | { type: "thought"; content: string }
  | { type: "action"; toolName: string; toolInput: string }
  | { type: "answer"; content: string }
  | { type: "error"; content: string };

/**
 * Parse LLM output into a sequence of ReAct steps.
 * Handles partial / streaming output gracefully.
 */
export function parseReActResponse(text: string): ParsedStep[] {
  const steps: ParsedStep[] = [];

  // Match <Thought>...</Thought>
  const thoughtRe = /<Thought>([\s\S]*?)<\/Thought>/g;
  let m: RegExpExecArray | null;
  while ((m = thoughtRe.exec(text)) !== null) {
    steps.push({ type: "thought", content: m[1].trim() });
  }

  // Match <Action tool="name">...</Action>
  const actionRe = /<Action\s+tool="([^"]+)">([\s\S]*?)<\/Action>/g;
  while ((m = actionRe.exec(text)) !== null) {
    steps.push({ type: "action", toolName: m[1].trim(), toolInput: m[2].trim() });
  }

  // Match <Answer>...</Answer>
  const answerRe = /<Answer>([\s\S]*?)<\/Answer>/g;
  while ((m = answerRe.exec(text)) !== null) {
    steps.push({ type: "answer", content: m[1].trim() });
  }

  // If nothing matched, treat the whole text as an answer (safety fallback)
  if (steps.length === 0 && text.trim()) {
    steps.push({ type: "answer", content: text.trim() });
  }

  return steps;
}

/**
 * Check whether the parsed steps contain a terminal Answer.
 */
export function hasAnswer(steps: ParsedStep[]): boolean {
  return steps.some((s) => s.type === "answer");
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/agents/react-engine.test.ts 2>&1 | tail -10
```

Expected: 7 tests PASS

**Step 5: Commit**

```bash
git add src/agents/react-engine.ts __tests__/agents/react-engine.test.ts
git commit -m "feat(agent): implement ReAct parser and system prompt builder"
```

---

### Task 4: Replace the conversation manager with the ReAct loop

**Files:**
- Modify: `src/agents/conversation.ts`

**Step 1: Replace `src/agents/conversation.ts` entirely**

```typescript
/**
 * ReAct conversation runner.
 *
 * Flow per turn:
 *  1. Build messages (system + history + new user msg)
 *  2. Call LLM → parse output into steps
 *  3. If Action found: execute tool → inject Observation → goto 2
 *  4. If Answer found: done
 *  5. Max 5 iterations guard
 *
 * Each step is yielded as a Server-Sent Event so the UI can render
 * thought/action/observation in real time.
 */
import { streamChat, type ChatStreamResponse } from "@server/llm";
import type { ChatMessage } from "@server/llm/types";
import { buildReActSystemPrompt, parseReActResponse, hasAnswer } from "./react-engine";
import { executeAgentTool, AGENT_TOOLS } from "./tool-registry";
import type { AgentContext, ReActEvent } from "./types";
import type { Note } from "@/types/note";

export interface ConversationRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: AgentContext;
  allNotes: Note[];
}

const MAX_ITERATIONS = 5;

/**
 * Async generator that runs the ReAct loop and yields SSE lines.
 *
 * Each yielded string is a complete SSE block, e.g.:
 *   "event: thought\ndata: {...}\n\n"
 */
export async function* runReActLoop(
  req: ConversationRequest
): AsyncGenerator<string> {
  const { messages, context, allNotes } = req;

  const noteContext =
    context.noteContent !== null
      ? { title: context.noteTitle ?? "", content: context.noteContent }
      : null;

  const systemPrompt = buildReActSystemPrompt(AGENT_TOOLS);

  // Build the LLM message history
  const history: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Collect full LLM response (we parse after full generation)
    let llmOutput = "";

    const stream = await streamChat(history, undefined);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        sseBuffer += decoder.decode(value, { stream: true });
        // Extract text from SSE data lines
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              const delta =
                parsed?.choices?.[0]?.delta?.content ??
                parsed?.choices?.[0]?.message?.content ??
                parsed?.content ?? "";
              llmOutput += delta;
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }
      if (done) break;
    }

    // Parse the complete LLM output
    const steps = parseReActResponse(llmOutput);

    // Yield each step as an SSE event
    for (const step of steps) {
      if (step.type === "thought") {
        yield sseEvent("thought", { content: step.content });
      } else if (step.type === "action") {
        yield sseEvent("action", { toolName: step.toolName, toolInput: step.toolInput });

        // Execute the tool
        const observation = await executeAgentTool(
          step.toolName,
          step.toolInput,
          noteContext,
          allNotes
        );

        yield sseEvent("observation", { toolName: step.toolName, content: observation });

        // Inject observation back into history for next iteration
        history.push({
          role: "assistant",
          content: llmOutput,
        });
        history.push({
          role: "user",
          content: `<Observation tool="${step.toolName}">\n${observation}\n</Observation>\n\n请继续。`,
        });
      } else if (step.type === "answer") {
        yield sseEvent("answer", { content: step.content });
        return; // Done
      }
    }

    // If LLM gave us only thoughts and no action/answer, add to history and continue
    if (!hasAnswer(steps) && !steps.some((s) => s.type === "action")) {
      history.push({ role: "assistant", content: llmOutput });
    }

    if (hasAnswer(steps)) return;
  }

  // Exhausted iterations
  yield sseEvent("error", { content: "Agent 达到最大迭代次数，请重新提问。" });
}

function sseEvent(event: string, data: Record<string, string>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

**Step 2: Update `app/api/ai/chat/route.ts` to use the generator**

```typescript
/**
 * POST /api/ai/chat — ReAct Agent 多轮对话
 *
 * 请求体：
 * {
 *   messages: Array<{ role: "user"|"assistant", content: string }>,
 *   noteId?: string,
 *   noteContent?: string,
 *   noteTitle?: string,
 *   allNotes?: Note[]
 * }
 *
 * 响应：SSE 流，每条 event 为 thought|action|observation|answer|error
 */
import { NextRequest } from "next/server";
import { runReActLoop } from "@agents/conversation";
import type { AgentContext } from "@agents/types";
import type { Note } from "@/types/note";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      return Response.json({ error: "messages 数组不能为空" }, { status: 400 });
    }

    const context: AgentContext = {
      noteId: body.noteId ?? null,
      noteContent: typeof body.noteContent === "string" ? body.noteContent : null,
      noteTitle: typeof body.noteTitle === "string" ? body.noteTitle : null,
    };

    const allNotes: Note[] = Array.isArray(body.allNotes) ? body.allNotes : [];

    const generator = runReActLoop({ messages, context, allNotes });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors (or only pre-existing unrelated errors)

**Step 4: Run full tests**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/agents/conversation.ts app/api/ai/chat/route.ts
git commit -m "feat(agent): replace prompt builder with ReAct loop engine"
```

---

## Phase 2: Frontend UI Enhancements

### Task 5: Rich Agent message rendering (Thought/Action/Observation/Answer)

**Files:**
- Modify: `src/client/components/agent/AgentMessage.tsx`
- Create: `src/client/components/agent/AgentStepCard.tsx`

**Step 1: Create `src/client/components/agent/AgentStepCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MarkdownPreview } from "@client/components/notes/MarkdownPreview";
import type { AgentStep } from "@/types/agent";

const STEP_CONFIG = {
  thought: {
    label: "💭 思考",
    className: "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30",
    labelClass: "text-blue-600 dark:text-blue-400",
    collapsible: true,
  },
  action: {
    label: "🔧 调用工具",
    className: "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30",
    labelClass: "text-amber-600 dark:text-amber-400",
    collapsible: false,
  },
  observation: {
    label: "📋 工具结果",
    className: "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30",
    labelClass: "text-green-600 dark:text-green-400",
    collapsible: true,
  },
  answer: {
    label: "",
    className: "",
    labelClass: "",
    collapsible: false,
  },
  error: {
    label: "⚠️ 错误",
    className: "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30",
    labelClass: "text-red-600 dark:text-red-400",
    collapsible: false,
  },
};

export function AgentStepCard({ step }: { step: AgentStep }) {
  const [collapsed, setCollapsed] = useState(true);
  const cfg = STEP_CONFIG[step.type];

  // Answer renders as plain markdown bubble (no card wrapper)
  if (step.type === "answer") {
    return (
      <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
        <MarkdownPreview content={step.content} />
      </div>
    );
  }

  const displayContent =
    step.type === "action" ? `**工具:** \`${step.toolName}\`\n\`\`\`json\n${step.content}\n\`\`\`` : step.content;

  return (
    <div className={`rounded-md border text-xs ${cfg.className}`}>
      <button
        type="button"
        className={`flex w-full items-center justify-between px-3 py-1.5 font-medium ${cfg.labelClass}`}
        onClick={() => cfg.collapsible && setCollapsed((v) => !v)}
      >
        <span>{cfg.label}{step.toolName && step.type === "action" ? `: ${step.toolName}` : ""}</span>
        {cfg.collapsible && (
          <span className="ml-2 opacity-60">{collapsed ? "▶" : "▼"}</span>
        )}
      </button>
      {(!cfg.collapsible || !collapsed) && (
        <div className="border-t border-current/10 px-3 py-2 opacity-80">
          <MarkdownPreview content={displayContent} />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update `src/client/components/agent/AgentMessage.tsx`**

```tsx
"use client";

import type { AgentMessage as AgentMessageType } from "@/types/agent";
import { AgentStepCard } from "./AgentStepCard";

export function AgentMessage({ message }: { message: AgentMessageType }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] rounded-lg bg-foreground px-3 py-2 text-sm text-background">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant: render step cards + final answer
  const steps = message.steps ?? [];
  const hasSteps = steps.length > 0;

  return (
    <div className="mb-4 space-y-1.5">
      {/* Intermediate reasoning steps */}
      {hasSteps && (
        <div className="space-y-1">
          {steps.map((step, i) => (
            <AgentStepCard key={i} step={step} />
          ))}
        </div>
      )}
      {/* Streaming placeholder when no content yet */}
      {!hasSteps && !message.content && (
        <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground animate-pulse">
          思考中…
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/client/components/agent/AgentStepCard.tsx src/client/components/agent/AgentMessage.tsx
git commit -m "feat(ui): add AgentStepCard for thought/action/observation rendering"
```

---

### Task 6: Update AgentChatPanel to consume ReAct SSE events

**Files:**
- Modify: `src/client/components/agent/AgentChatPanel.tsx`

The panel must now parse `event: thought|action|observation|answer|error` SSE lines and build `steps` array incrementally.

**Step 1: Replace `AgentChatPanel.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import type { AgentMessage as AgentMessageType, AgentStep } from "@/types/agent";

export interface AgentChatPanelProps {
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
  /** Called when user clicks "应用到编辑器" on an answer */
  onApplyToEditor?: (content: string) => void;
}

type SSEEventType = "thought" | "action" | "observation" | "answer" | "error";

function parseSseLine(line: string): { event: SSEEventType; data: Record<string, string> } | null {
  // We buffer event + data lines as a pair
  return null; // handled in the streaming loop below
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

      const conversationHistory = [...messages, userMsg];
      setMessages(conversationHistory);
      setStreaming(true);

      const assistantId = `msg-${Date.now() + 1}`;
      const assistantMsg: AgentMessageType = {
        id: assistantId,
        role: "assistant",
        content: "",
        steps: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
            noteId,
            noteTitle,
            noteContent,
            allNotes: notes.filter((n) => !n.id.startsWith("local-")),
          }),
        });

        if (!res.ok || !res.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: "请求失败，请重试。" } : m
            )
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let rawBuffer = "";
        // SSE state machine
        let currentEvent: SSEEventType | null = null;

        const applyStep = (event: SSEEventType, dataStr: string) => {
          let data: Record<string, string> = {};
          try { data = JSON.parse(dataStr); } catch { /* ignore */ }

          if (event === "answer") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: data.content ?? "" }
                  : m
              )
            );
            return;
          }

          const step: AgentStep = {
            type: event,
            content: data.content ?? data.toolInput ?? "",
            ...(data.toolName ? { toolName: data.toolName } : {}),
          };

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, steps: [...(m.steps ?? []), step] }
                : m
            )
          );
        };

        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            rawBuffer += decoder.decode(value, { stream: true });
            const lines = rawBuffer.split("\n");
            rawBuffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim() as SSEEventType;
              } else if (line.startsWith("data: ") && currentEvent) {
                applyStep(currentEvent, line.slice(6));
                currentEvent = null;
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
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <h2 className="text-sm font-semibold">Agent 对话</h2>
        <button
          type="button"
          onClick={() => setMessages([])}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          清空
        </button>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 ? (
          <div className="mt-10 space-y-3 text-center text-xs text-muted-foreground px-4">
            <p className="text-sm font-medium text-foreground">你好！我是文档 Agent</p>
            <ul className="text-left space-y-2 mt-3 text-xs">
              <li className="flex items-start gap-2"><span>📖</span><span>分析并引用当前笔记内容</span></li>
              <li className="flex items-start gap-2"><span>🔍</span><span>搜索你的所有笔记知识库</span></li>
              <li className="flex items-start gap-2"><span>📝</span><span>起草会议纪要、技术文档、周报</span></li>
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

**Step 2: Update `AgentMessage.tsx` to pass `onApplyToEditor` to answer cards**

Add `onApplyToEditor?: (content: string) => void` prop to `AgentMessage` and thread it into `AgentStepCard` for `answer` type steps. In `AgentStepCard`, add a small "应用到编辑器" button below the answer markdown when `onApplyToEditor` is provided.

Modify `src/client/components/agent/AgentStepCard.tsx` answer section:

```tsx
// In AgentStepCard, add props:
export function AgentStepCard({
  step,
  onApplyToEditor,
}: {
  step: AgentStep;
  onApplyToEditor?: (content: string) => void;
}) {
  // ... existing code ...
  if (step.type === "answer") {
    return (
      <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
        <MarkdownPreview content={step.content} />
        {onApplyToEditor && step.content && (
          <button
            type="button"
            onClick={() => onApplyToEditor(step.content)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            应用到编辑器 →
          </button>
        )}
      </div>
    );
  }
  // ...
}
```

Also update `AgentMessage.tsx` to pass `onApplyToEditor` down to `AgentStepCard`.

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/client/components/agent/
git commit -m "feat(ui): update AgentChatPanel to consume ReAct SSE events with step cards"
```

---

### Task 7: Resizable panel divider

**Files:**
- Create: `src/client/hooks/useResizablePanel.ts`
- Modify: `app/note/[id]/page.tsx`

**Step 1: Create `src/client/hooks/useResizablePanel.ts`**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 280;
const MAX_WIDTH = 620;
const DEFAULT_WIDTH = 380;
const STORAGE_KEY = "agent-panel-width";

export function useResizablePanel() {
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(stored))) : DEFAULT_WIDTH;
  });

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX; // dragging left = wider
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persist
      setPanelWidth((w) => {
        localStorage.setItem(STORAGE_KEY, String(w));
        return w;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return { panelWidth, onDividerMouseDown: onMouseDown };
}
```

**Step 2: Update `app/note/[id]/page.tsx` to use the hook**

In the layout section at the bottom of the file, replace the static `w-[380px]` panel with:

```tsx
// At the top of the component, add:
import { useResizablePanel } from "@client/hooks/useResizablePanel";

// Inside the component:
const { panelWidth, onDividerMouseDown } = useResizablePanel();

// Replace the right panel div:
{/* Drag divider */}
<div
  className="hidden lg:flex w-1 cursor-col-resize items-center justify-center shrink-0 hover:bg-primary/20 active:bg-primary/30 transition-colors group relative"
  onMouseDown={onDividerMouseDown}
>
  <div className="h-8 w-0.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
</div>

{/* Right panel */}
<div
  className="hidden lg:flex flex-col border-l border-border shrink-0"
  style={{ width: panelWidth }}
>
  <AgentChatPanel
    noteId={id.startsWith("local-") ? null : id}
    noteTitle={title}
    noteContent={content}
    onApplyToEditor={(agentContent) => {
      setContent((prev) => prev + "\n\n" + agentContent);
      setIsDirty(true);
    }}
  />
</div>
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/client/hooks/useResizablePanel.ts app/note/[id]/page.tsx
git commit -m "feat(ui): add drag-resizable agent panel divider with localStorage persistence"
```

---

### Task 8: Smart tooltip positioning for text selection

**Files:**
- Modify: `src/client/components/notes/SelectionAiPopover.tsx`
- Modify: `app/note/[id]/page.tsx` (update `handleSelectionChange`)

**Step 1: Update `SelectionAiPopover.tsx` to accept bounding rect**

Replace the current position prop `{ top, left }` with a richer `anchorRect`:

```tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@client/components/ui/button";

export type AiAction = "polish" | "rewrite" | "summarize" | "expand" | "translate";

const ACTION_LABELS: Record<AiAction, string> = {
  polish: "AI 润色",
  rewrite: "AI 改写",
  summarize: "AI 总结",
  expand: "AI 扩写",
  translate: "AI 翻译",
};

export interface SelectionAiPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** DOMRect of the selected text range */
  anchorRect: DOMRect | null;
  onAction: (action: AiAction) => void;
}

const POPOVER_HEIGHT = 44; // approximate px
const POPOVER_GAP = 8;

export function SelectionAiPopover({
  open,
  onOpenChange,
  anchorRect,
  onAction,
}: SelectionAiPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRect || !containerRef.current) {
      setPosition(null);
      return;
    }
    const popoverWidth = containerRef.current.offsetWidth || 280;
    const spaceAbove = anchorRect.top;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const preferAbove = spaceAbove >= POPOVER_HEIGHT + POPOVER_GAP;

    const top = preferAbove
      ? anchorRect.top - POPOVER_HEIGHT - POPOVER_GAP + window.scrollY
      : anchorRect.bottom + POPOVER_GAP + window.scrollY;

    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - popoverWidth - 8,
        anchorRect.left + anchorRect.width / 2 - popoverWidth / 2
      )
    );

    setPosition({ top, left });
  }, [open, anchorRect]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-lg"
      style={
        position
          ? { top: position.top, left: position.left }
          : { visibility: "hidden", top: 0, left: 0 }
      }
      role="toolbar"
      aria-label="AI 操作"
    >
      {(Object.keys(ACTION_LABELS) as AiAction[]).map((action) => (
        <Button
          key={action}
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            onAction(action);
            onOpenChange(false);
          }}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
    </div>
  );
}
```

**Step 2: Update `app/note/[id]/page.tsx` to pass `anchorRect`**

Change the state from `position: { top, left }` to `anchorRect: DOMRect | null`, and update `handleSelectionChange` to capture the actual selection `DOMRect`:

```tsx
// Replace:
const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);
// With:
const [selectionAnchorRect, setSelectionAnchorRect] = useState<DOMRect | null>(null);

// Replace handleSelectionChange:
const handleSelectionChange = useCallback(() => {
  const range = editorRef.current?.getSelectionRange() ?? null;
  if (range) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const domRange = selection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();
      if (rect.width > 0) {
        setSelectionAnchorRect(rect);
        setSelectionPopoverOpen(true);
        return;
      }
    }
  }
  setSelectionPopoverOpen(false);
  setSelectionAnchorRect(null);
}, []);

// Update SelectionAiPopover usage:
<SelectionAiPopover
  open={selectionPopoverOpen}
  onOpenChange={setSelectionPopoverOpen}
  anchorRect={selectionAnchorRect}
  onAction={(action) => handleAiProcess(action)}
/>
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/client/components/notes/SelectionAiPopover.tsx app/note/[id]/page.tsx
git commit -m "feat(ui): smart tooltip positioning above selection with fallback to below"
```

---

### Task 9: Mobile full-screen Agent modal

**Files:**
- Create: `src/client/components/agent/AgentMobileModal.tsx`
- Modify: `app/note/[id]/page.tsx`

**Step 1: Create `src/client/components/agent/AgentMobileModal.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { AgentChatPanel } from "./AgentChatPanel";

export interface AgentMobileModalProps {
  open: boolean;
  onClose: () => void;
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
  onApplyToEditor?: (content: string) => void;
}

export function AgentMobileModal({
  open,
  onClose,
  noteId,
  noteTitle,
  noteContent,
  onApplyToEditor,
}: AgentMobileModalProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
      {/* Close bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <span className="text-sm font-semibold">Agent 对话</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
          aria-label="关闭"
        >
          ✕ 关闭
        </button>
      </div>
      {/* Chat panel fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AgentChatPanel
          noteId={noteId}
          noteTitle={noteTitle}
          noteContent={noteContent}
          onApplyToEditor={(content) => {
            onApplyToEditor?.(content);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
```

**Step 2: Add mobile Agent button and modal to `app/note/[id]/page.tsx`**

In the note detail page:

```tsx
// Add import
import { AgentMobileModal } from "@client/components/agent/AgentMobileModal";

// Add state
const [mobileAgentOpen, setMobileAgentOpen] = useState(false);

// In the header buttons area, add a mobile-only Agent button (show on small screens):
<button
  type="button"
  onClick={() => setMobileAgentOpen(true)}
  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 lg:hidden"
>
  Agent
</button>

// Before the closing </div> of the page, add:
<AgentMobileModal
  open={mobileAgentOpen}
  onClose={() => setMobileAgentOpen(false)}
  noteId={id.startsWith("local-") ? null : id}
  noteTitle={title}
  noteContent={content}
  onApplyToEditor={(agentContent) => {
    setContent((prev) => prev + "\n\n" + agentContent);
    setIsDirty(true);
  }}
/>
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/client/components/agent/AgentMobileModal.tsx app/note/[id]/page.tsx
git commit -m "feat(ui): add mobile full-screen Agent modal"
```

---

### Task 10: Final verification and cleanup

**Step 1: Run full test suite**

```bash
cd .worktrees/feature-react-agent
npx vitest run 2>&1
```

Expected: all tests PASS (at minimum 22+ tests)

**Step 2: TypeScript full check**

```bash
npx tsc --noEmit 2>&1
```

Expected: 0 errors

**Step 3: Check for lint errors**

```bash
npx next build 2>&1 | tail -20
```

Expected: successful build with no type errors

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git status
# commit only if there are changes
```

**Step 5: Done — invoke finishing-a-development-branch skill**
