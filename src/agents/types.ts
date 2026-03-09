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
  data: string; // JSON-encoded payload
}

export interface AgentContext {
  noteId: string | null;
  noteContent: string | null;
  noteTitle: string | null;
}

export type { ChatMessage };
