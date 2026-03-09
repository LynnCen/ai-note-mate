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
