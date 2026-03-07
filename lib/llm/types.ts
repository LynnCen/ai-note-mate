/**
 * LLM adapter types. Used by streamChat and provider implementations.
 */

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Optional callbacks for streaming (e.g. logging or testing).
 * The primary contract is ReadableStream<Uint8Array>; callbacks are best-effort.
 */
export interface StreamOptions {
  onChunk?(text: string): void;
  onDone?(): void;
}
