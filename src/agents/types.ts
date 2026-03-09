import type { ChatMessage } from "@server/llm/types";

/** Internal agent turn */
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

export type { ChatMessage };
