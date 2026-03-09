/**
 * Configurable LLM adapter. Dispatches to provider based on LLM_PROVIDER env.
 * Server-side only.
 */

import { getLLMProvider, getDeepSeekKey, getOpenAIKey, getGmlKey } from "@server/env";
import { streamChatDeepSeek } from "./providers/deepseek";
import { streamChatGml } from "./providers/gml";
import { streamChatOpenAI } from "./providers/openai";
import {
  chatWithToolsStream as chatWithToolsStreamImpl,
} from "./providers/tool-calling";
import type { ChatMessage, StreamOptions, ToolDefinition, ProviderStreamEvent } from "./types";

export type {
  ChatMessage,
  ChatRole,
  StreamOptions,
  ToolDefinition,
  ProviderStreamEvent,
} from "./types";

/**
 * Stream chat completion using the configured LLM provider (LLM_PROVIDER).
 * Returns a ReadableStream<Uint8Array> that emits SSE "data: {...}\n\n" lines.
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

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

/**
 * Tool calling streaming chat using the configured LLM provider.
 * Yields ProviderStreamEvent objects for real-time processing.
 * Supports AbortSignal for cancellation.
 * Defaults to openai when LLM_PROVIDER is not set.
 */
export async function* chatWithToolsStream(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal
): AsyncGenerator<ProviderStreamEvent> {
  const provider = getLLMProvider();
  const normalized = (provider?.toLowerCase() || "openai") as string;

  let baseUrl: string;
  let apiKey: string;
  let model: string;

  if (normalized === "deepseek") {
    baseUrl = "https://api.deepseek.com/v1";
    apiKey = getDeepSeekKey() ?? "";
    model = "deepseek-chat";
  } else if (normalized === "gml") {
    baseUrl = "https://open.bigmodel.cn/api/paas/v4";
    apiKey = getGmlKey() ?? "";
    model = "glm-4-flash";
  } else  {
    // openai (default) and others
    baseUrl = "https://api.openai.com/v1";
    apiKey = getOpenAIKey() ?? "";
    model = "gpt-4o-mini";
  }

  if (!apiKey) {
    yield { type: "error", message: `API key not set for provider: ${normalized}` };
    return;
  }

  yield* chatWithToolsStreamImpl(baseUrl, apiKey, model, messages, tools, signal);
}
