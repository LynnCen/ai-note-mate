/**
 * OpenAI-compatible Tool Calling streaming provider.
 * Works with OpenAI, DeepSeek (OpenAI-compat), and similar APIs.
 *
 * Returns an AsyncGenerator that yields ProviderStreamEvent objects
 * so the caller can react to content deltas and tool calls without buffering.
 */

import type { ChatMessage, ToolDefinition, ProviderStreamEvent } from "../types";

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
    index: number;
  }>;
}

/**
 * Stream chat with tool calling support. Yields structured ProviderStreamEvents.
 * The caller is responsible for executing tool calls and looping.
 *
 * @param baseUrl  API base URL (e.g. "https://api.openai.com/v1")
 * @param apiKey   Bearer token
 * @param model    Model ID
 * @param messages Conversation history
 * @param tools    Tool definitions (empty array = no tool calling)
 * @param signal   AbortSignal for cancellation
 */
export async function* chatWithToolsStream(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal
): AsyncGenerator<ProviderStreamEvent> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {}),
    })),
    stream: true,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return; // client cancelled — stop silently
    yield { type: "error", message: `LLM fetch failed: ${String(err)}` };
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    yield { type: "error", message: `LLM API error ${res.status}: ${text}` };
    return;
  }

  if (!res.body) {
    yield { type: "error", message: "LLM response has no body" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Track in-progress tool calls by stream index
  const toolCalls: Record<number, { id: string; name: string }> = {};
  let finishReason: string | null = null;
  let hasAnyToolCall = false;

  try {
    outer: while (true) {
      if (signal?.aborted) return;

      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      // Process all complete SSE lines in the buffer
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);

        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break outer;

        let chunk: OpenAIStreamChunk;
        try {
          chunk = JSON.parse(data) as OpenAIStreamChunk;
        } catch {
          continue;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        if (!delta) continue;

        // Content token — yield immediately for real-time streaming
        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield { type: "content_delta", content: delta.content };
        }

        // Tool call deltas
        for (const tc of delta.tool_calls ?? []) {
          const tcIdx = tc.index;

          if (!toolCalls[tcIdx]) {
            toolCalls[tcIdx] = { id: tc.id ?? "", name: tc.function?.name ?? "" };
          }
          // Accumulate id and name as they may arrive in separate deltas
          if (tc.id) toolCalls[tcIdx].id = tc.id;
          if (tc.function?.name) toolCalls[tcIdx].name = tc.function.name;

          // Emit tool_call_start once we have both id and name
          const entry = toolCalls[tcIdx];
          if (entry.id && entry.name && !hasAnyToolCall) {
            hasAnyToolCall = true;
          }
          if (entry.id && entry.name && tc.function?.name) {
            // First delta with name — emit start event
            yield {
              type: "tool_call_start",
              callId: entry.id,
              toolName: entry.name,
            };
          }

          if (tc.function?.arguments && entry.id) {
            yield {
              type: "tool_call_args_delta",
              callId: entry.id,
              argsDelta: tc.function.arguments,
            };
          }
        }
      }

      if (done) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (signal?.aborted) return;

  const reason =
    finishReason === "tool_calls" || hasAnyToolCall ? "tool_calls" : "stop";
  yield { type: "finish", reason };
}

/**
 * Extract completed tool calls from a list of collected ProviderStreamEvents.
 * Call this after draining chatWithToolsStream to get finalized tool call args.
 */
export function extractToolCalls(
  events: ProviderStreamEvent[]
): Array<{ callId: string; toolName: string; argsJson: string }> {
  const calls: Record<string, { toolName: string; args: string }> = {};

  for (const event of events) {
    if (event.type === "tool_call_start") {
      calls[event.callId] = { toolName: event.toolName, args: "" };
    } else if (event.type === "tool_call_args_delta") {
      if (calls[event.callId]) {
        calls[event.callId].args += event.argsDelta;
      }
    }
  }

  return Object.entries(calls).map(([callId, { toolName, args }]) => ({
    callId,
    toolName,
    argsJson: args,
  }));
}
