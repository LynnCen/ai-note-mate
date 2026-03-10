# Document Writing Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a structured "write document" mode for the Document Agent that replaces blind template usage with a guided, multi-step writing workflow.

**Architecture:** Extend the existing Document Agent system prompt and conversation state to support a dedicated writing mode, rewire tool usage so `draft_document` becomes opt-in skeleton-only, and centralize document type + writing profile handling in the conversation layer. Keep the implementation incremental and fully backwards compatible with current APIs.

**Tech Stack:** Next.js (App Router), TypeScript, React, custom LLM agent layer (`src/agents/*`), OpenAI-style tools.

---

### Task 1: Understand current document agent integration

**Files:**
- Read: `src/agents/document-agent/prompts.ts`
- Read: `src/agents/document-agent/tools.ts`
- Read: `src/agents/conversation.ts`
- Read: `src/agents/tool-registry.ts`

**Step 1: Inspect document agent system prompt and draft templates**

Open `src/agents/document-agent/prompts.ts` and identify:
- Current `DOCUMENT_AGENT_SYSTEM` instructions.
- How `DRAFT_TEMPLATES` are defined and referenced.

**Step 2: Inspect document agent tools implementation**

Open `src/agents/document-agent/tools.ts` and confirm:
- Signatures and behavior of `readCurrentNote`, `searchNotes`, and `draftDocument`.
- How `DRAFT_TEMPLATES` are used in `draftDocument`.

**Step 3: Inspect agent tool registry**

Open `src/agents/tool-registry.ts` and verify:
- How `AGENT_TOOLS` from the document agent are registered and exposed to the LLM.

**Step 4: Inspect conversation-level agent orchestration**

Open `src/agents/conversation.ts` and:
- Identify where the Document Agent is constructed/invoked.
- Note how system prompts, tools, and messages are passed to the LLM.

**Step 5: Take brief notes**

Create or update your own scratchpad (not committed) summarizing:
- Where to hook "writing mode" state.
- Where to adjust prompts and tool behavior.

---

### Task 2: Add writing mode concepts to conversation state

**Files:**
- Modify: `src/agents/conversation.ts`

**Step 1: Define writing mode-related types**

In `src/agents/conversation.ts`, introduce TypeScript types/interfaces for:
- `DocumentType` union (technical, tutorial, meeting_minutes, report, decision_record, other).
- `WritingProfile` (audience, tone, length, language).

**Step 2: Extend conversation state**

Add optional fields to whichever conversation/session state object is appropriate to store:
- `currentDocumentType?: DocumentType`
- `currentWritingProfile?: WritingProfile`
- `isInWritingMode?: boolean`

**Step 3: Ensure state is threaded through**

Update any factory or handler functions that construct the Document Agent call so they can receive:
- `isInWritingMode`
- `currentDocumentType`
- `currentWritingProfile`

Initially, default these to `false`/`undefined` so existing behavior is unchanged.

**Step 4: Type-check and build**

Run the type checker / build command to ensure no TypeScript errors:
- `npm run lint`
- `npm run build` (or project-specific command)

---

### Task 3: Enhance DOCUMENT_AGENT_SYSTEM for writing mode workflow

**Files:**
- Modify: `src/agents/document-agent/prompts.ts`

**Step 1: Embed high-level writing mode workflow**

In `DOCUMENT_AGENT_SYSTEM`, add a concise section that:
- Explains when to enter "写文档模式"（write document mode）.
- Describes the required steps:
  - 确认意图（写文档 vs 普通问答）
  - 询问文档类型
  - 询问写作 profile（受众/语气/长度）
  - 先给 2–3 个大纲方案
  - 用户确认/调整大纲后再展开正文
  - 根据用户偏好选择逐节写或一次写完

Keep this section short but explicit.

**Step 2: Document tool usage expectations**

Still in `DOCUMENT_AGENT_SYSTEM`, add brief guidelines:
- `read_note`：写文档时优先使用，获取当前笔记内容。
- `search_notes`：在需要历史/上下文时使用，而不是每次都用。
- `draft_document`：只在用户明确要求「模板/骨架」时使用，用于生成 Markdown 骨架，而不是最终成品。

**Step 3: Preserve language and brevity rules**

Ensure the existing rules（跟随用户语言、回复简洁、干净 Markdown）仍在系统提示中，并不被新的段落淹没。

**Step 4: Run lint/build if needed**

Verify the file compiles (no syntax/TS issues).

---

### Task 4: Route into writing mode based on user intent

**Files:**
- Modify: `src/agents/conversation.ts`

**Step 1: Identify entry points for user messages**

Locate the function(s) that receive raw user messages and decide:
- Which agent to call.
- What system prompt/tools to pass.

**Step 2: Implement a simple intent heuristic**

Add a small, rule-based heuristic (no extra LLM calls) that sets `isInWritingMode` to `true` when:
- The user explicitly uses phrases like “写文档”, “整理成文档”, “帮我写一篇…”, “帮我出一个技术方案文档”等。
- You can start with a basic regex / keyword list and refine later.

**Step 3: Thread writing mode flags into the agent call**

When `isInWritingMode` is `true`, ensure:
- The Document Agent is selected.
- System prompt is the enhanced `DOCUMENT_AGENT_SYSTEM`.
- The conversation state includes `isInWritingMode` so future enhancements can use it.

**Step 4: Add minimal logging/trace (optional)**

If you have a debug/log layer, add log lines when entering/exiting writing mode to help future debugging.

---

### Task 5: Guide the model to ask for document type and writing profile

**Files:**
- Modify: `src/agents/document-agent/prompts.ts`

**Step 1: Add explicit instructions for document type question**

Update `DOCUMENT_AGENT_SYSTEM` to instruct:
- When `isInWritingMode` and文档类型未知, the first response should:
  - 简要复述用户需求。
  - 提出一个多选问题，列出若干文档类型选项，并允许“其他”。

**Step 2: Add explicit instructions for writing profile question**

In the same system prompt, specify that after确定文档类型, the agent should:
- 询问受众、语气、预期长度（可通过 1–2 个问题完成）。

**Step 3: Keep questions lightweight**

Add a note to avoid问太多问题一次性淹没用户, prefer:
- 先问文档类型。
- 再用 1–2 个问题获取 profile。

---

### Task 6: Rewire draft_document usage to be opt-in

**Files:**
- Modify: `src/agents/document-agent/tools.ts`
- Modify: `src/agents/tool-registry.ts` (doc comments only if needed)

**Step 1: Update tool description for draft_document**

In `AGENT_TOOLS` definition for `draft_document`, update the description to emphasize:
- 用于生成 Markdown 文档骨架模板。
- 只在用户明确需要模板/骨架时调用。

**Step 2: Ensure templates are treated as skeletons**

In `draftDocument` implementation, add (or refine) behavior to:
- Keep output focused on结构（标题/章节），不要预填大量正文。
- 允许后续在同一对话中，基于该骨架继续填充内容。

**Step 3: Optional: extend template keys**

Consider adding new template keys aligned with design doc:
- `tech_design`, `tutorial`, `adr`, 等。

Keep them minimal initially; more can be added later.

**Step 4: Verify tool metadata**

Ensure `AGENT_TOOLS` parameters for `draft_document` still match implementation:
- Allowed template enum includes any new keys.

---

### Task 7: Encourage outline-first behavior without extra APIs

**Files:**
- Modify: `src/agents/document-agent/prompts.ts`

**Step 1: Add outline-first instruction**

In `DOCUMENT_AGENT_SYSTEM`, add a short rule within写文档模式:
- 在未确认大纲前，不要直接输出完整正文。
- 先输出 2–3 套大纲备选。

**Step 2: Clarify user override behavior**

Specify in the prompt:
- 如果用户明确要求“不要大纲，直接写完整文档”，可以直接输出全文。
- 但仍然鼓励用户在后续按章节重写或调整。

---

### Task 8: Manual testing in dev environment

**Files:**
- No direct code changes; use the running dev server (`npm run dev`).

**Step 1: Start dev server (if not already running)**

Run:

```bash
npm run dev
```

**Step 2: Test standard writing flows**

In the UI, try prompts like:
- “帮我把当前笔记整理成一份技术设计文档。”
- “帮我写一篇教程，教新同事如何使用这个工具。”
- “帮我写这次会议的纪要。”

Verify:
- Agent询问文档类型和写作 profile。
- 先给出多个大纲备选，再展开正文。

**Step 3: Test skeleton template flow**

Try prompts like:
- “给我一个会议纪要的 Markdown 模板，我自己填。”

Verify:
- Agent不会直接写完整正文，而是调用骨架模板。

**Step 4: Test non-writing flows**

Ask普通问答类问题，确认:
- 不会误入写文档模式。

**Step 5: Capture issues**

记下任何不符合设计文档的行为，作为未来迭代的输入。

---

### Task 9: Update documentation

**Files:**
- Modify: `docs/plans/2026-03-10-document-writing-mode-design.md`

**Step 1: Cross-check implementation vs design**

After implementation, review:
- 实际行为是否符合设计文档中的流程。

**Step 2: Add a short “Implementation Notes” section**

Append to the design doc:
- 简要记录与原设计不一致的地方（如果有）。
- 记录任何新增的文档类型或模板 key。

