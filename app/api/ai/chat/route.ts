import { NextRequest } from "next/server";
import { runToolCallingLoop } from "@agents/conversation";
import type { AgentContext } from "@agents/types";

export async function POST(request: NextRequest) {
  let body: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    noteId: string | null;
    noteTitle: string;
    noteContent: string;
    allNotes: Array<{ id: string; title: string; content: string; createdAt: string; updatedAt: string }>;
    provider?: string;
    mode?: "agent" | "ask";
  };

  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, noteId, noteTitle, noteContent, allNotes, provider, mode } = body;

  const context: AgentContext = {
    noteId: noteId ?? null,
    noteContent: noteContent ?? null,
    noteTitle: noteTitle ?? null,
    providerOverride: provider,
    mode: mode ?? "agent",
  };

  const generator = runToolCallingLoop({
    messages,
    context,
    allNotes,
    signal: request.signal,
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          if (request.signal.aborted) break;
          controller.enqueue(new TextEncoder().encode(chunk));
        }
      } catch (err) {
        if (!request.signal.aborted) {
          const errorSse = `event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorSse));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // client disconnected — generator will stop on next signal check
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
