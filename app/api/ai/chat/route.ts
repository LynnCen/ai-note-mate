/**
 * POST /api/ai/chat — Agent 多轮对话，支持当前笔记上下文注入、跨笔记搜索、文档起草。
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
 * 响应：SSE 文本流（Content-Type: text/event-stream）
 */
import { NextRequest } from "next/server";
import { streamChat } from "@server/llm";
import { buildAgentMessages } from "@agents/conversation";
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

    const llmMessages = buildAgentMessages({ messages, context, allNotes });

    const stream = await streamChat(llmMessages, undefined);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: message }, { status: 500 });
  }
}
