/**
 * OpenAI streaming chat. Uses fetch + SSE; server-side only.
 */

import { getOpenAIKey } from "@server/env";
import type { ChatMessage, StreamOptions } from "../types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function toOpenAIMessages(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Stream chat completion from OpenAI. Returns a ReadableStream<Uint8Array>
 * that emits SSE lines ("data: {...}\n\n") so the route can pipe with
 * Content-Type: text/event-stream.
 */
export async function streamChatOpenAI(
  messages: ChatMessage[],
  options?: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: toOpenAIMessages(messages),
      stream: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("OpenAI response has no body");
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
          const content = parseOpenAISSEEvent(event);
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

function parseOpenAISSEEvent(event: string): string | null {
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

function processBuffer(
  buffer: string,
  onText: (text: string) => void
): void {
  const parts = buffer.split("\n\n");
  for (const event of parts) {
    const content = parseOpenAISSEEvent(event);
    if (content) onText(content);
  }
}
