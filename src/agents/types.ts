import type { ChatMessage, ToolDefinition } from "@server/llm/types";

export type { ChatMessage, ToolDefinition };

export interface AgentContext {
  noteId: string | null;
  noteContent: string | null;
  noteTitle: string | null;
}
