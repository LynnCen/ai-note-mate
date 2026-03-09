/** Client-side Agent message types */

export type AgentEventType =
  | "content_delta"
  | "tool_call_start"
  | "tool_result"
  | "done"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  content?: string;     // content_delta text / tool_result content / error message
  toolName?: string;    // tool_call_start / tool_result
  toolInput?: string;   // tool_call_start parsed args (for display)
  callId?: string;      // tool_call_start / tool_result pairing
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  events: AgentEvent[];   // ordered stream of events for this message
  fullContent: string;    // accumulated content_delta text (for display + apply-to-editor)
  isDone: boolean;        // true after "done" event received
  createdAt: string;
}

export interface AgentConversation {
  messages: AgentMessage[];
}
