/**
 * Configurable LLM adapter. Dispatches to provider based on LLM_PROVIDER env.
 * Server-side only.
 */

import { getLLMProvider } from "@server/env";
import { streamChatDeepSeek } from "./providers/deepseek";
import { streamChatGml } from "./providers/gml";
import { streamChatOpenAI } from "./providers/openai";
import type { ChatMessage, StreamOptions } from "./types";

export type { ChatMessage, ChatRole, StreamOptions } from "./types";

/**
 * Stream chat completion using the configured LLM provider (LLM_PROVIDER).
 * Returns a ReadableStream<Uint8Array> that emits SSE "data: {...}\n\n" lines
 * so the route can respond with Content-Type: text/event-stream.
 * Defaults to openai when LLM_PROVIDER is not set.
 *
 * @throws if the selected provider's API key is not set
 */
export async function streamChat(
  messages: ChatMessage[],
  options?: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const provider = getLLMProvider();
  const normalized = (provider?.toLowerCase() || "openai") as string;

  if (normalized === "openai") {
    return streamChatOpenAI(messages, options);
  }
  if (normalized === "deepseek") {
    return streamChatDeepSeek(messages, options);
  }
  if (normalized === "gml") {
    return streamChatGml(messages, options);
  }

  if (normalized === "groq") {
    throw new Error("LLM_PROVIDER=groq is not implemented yet");
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}
