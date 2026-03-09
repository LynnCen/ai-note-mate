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
