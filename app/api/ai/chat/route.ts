/**
 * POST /api/ai/chat — ReAct Agent 多轮对话
 *
 * 请求体：
 * {
 *   messages: Array<{ role: "user"|"assistant", content: string }>,
 *   noteId?: string,
 *   noteContent?: string,
 *   noteTitle?: string,
 *   allNotes?: Note[]
 * }
 *
 * 响应：SSE 流，每条 event 为 thought|action|observation|answer|error
 */
import { NextRequest } from "next/server";
import { runReActLoop } from "@agents/conversation";
import type { AgentContext } from "@agents/types";
import type { Note } from "@/types/note";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      return Response.json({ error: "messages 数组不能为空" }, { status: 400 });
    }

    const context: AgentContext = {
      noteId: body.noteId ?? null,
      noteContent: typeof body.noteContent === "string" ? body.noteContent : null,
      noteTitle: typeof body.noteTitle === "string" ? body.noteTitle : null,
    };

    const allNotes: Note[] = Array.isArray(body.allNotes) ? body.allNotes : [];

    const generator = runReActLoop({ messages, context, allNotes });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            console.log("chunk", chunk);
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: message }, { status: 500 });
  }
}
