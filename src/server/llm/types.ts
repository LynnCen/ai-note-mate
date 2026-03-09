/**
 * LLM adapter types. Used by streamChat and provider implementations.
 */

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string; // for tool role messages
  name?: string; // for tool role messages
}

export interface StreamOptions {
  onChunk?(text: string): void;
  onDone?(): void;
}

/** OpenAI-compatible tool definition */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}

/** Events yielded by chatWithToolsStream */
export type ProviderStreamEvent =
  | { type: "content_delta"; content: string }
  | { type: "tool_call_start"; callId: string; toolName: string }
  | { type: "tool_call_args_delta"; callId: string; argsDelta: string }
  | { type: "finish"; reason: "stop" | "tool_calls" | "length" }
  | { type: "error"; message: string };
