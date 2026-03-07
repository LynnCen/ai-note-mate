/**
 * DeepSeek streaming chat. OpenAI-compatible API; uses fetch + SSE; server-side only.
 */

import { getDeepSeekKey } from "@/lib/env";
import type { ChatMessage, StreamOptions } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

function toDeepSeekMessages(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Stream chat completion from DeepSeek. Returns a ReadableStream<Uint8Array>
 * that emits SSE lines ("data: {...}\n\n") so the route can pipe with
 * Content-Type: text/event-stream.
 */
export async function streamChatDeepSeek(
  messages: ChatMessage[],
  options?: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = getDeepSeekKey();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: toDeepSeekMessages(messages),
      stream: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("DeepSeek response has no body");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        if (done) {
          processBuffer(buffer, (text) => {
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
              options?.onChunk?.(text);
            }
          });
          options?.onDone?.();
          controller.close();
          return;
        }
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const content = parseDeepSeekSSEEvent(event);
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            options?.onChunk?.(content);
          }
        }
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

function parseDeepSeekSSEEvent(event: string): string | null {
  const line = event.split("\n").find((l) => l.startsWith("data: "));
  if (!line) return null;
  const data = line.slice(6);
  if (data === "[DONE]") return null;
  try {
    const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
    const content = json.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

function processBuffer(buffer: string, onText: (text: string) => void): void {
  const parts = buffer.split("\n\n");
  for (const event of parts) {
    const content = parseDeepSeekSSEEvent(event);
    if (content) onText(content);
  }
}
