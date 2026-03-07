/**
 * POST /api/ai/stream — AI stream proxy. Uses server-side LLM key; streams
 * polished/expanded text via SSE. Body: { content: string }.
 */

import { streamChat } from "@/lib/llm";
import { NextRequest } from "next/server";

const SYSTEM_PROMPT =
  "You help polish and expand the user's note. Output only the improved text, no preamble or explanation.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const content =
      typeof body?.content === "string"
        ? body.content.trim()
        : typeof body?.selectedText === "string"
          ? body.selectedText.trim()
          : undefined;

    if (!content) {
      return Response.json(
        { error: "Missing or empty content. Send { content: string }." },
        { status: 400 }
      );
    }

    const stream = await streamChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      undefined
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isMissingKey =
      /is not set|API key|api key/i.test(message) || message.includes("OPENAI_API_KEY") || message.includes("DEEPSEEK_API_KEY");

    return Response.json(
      { error: isMissingKey ? "AI service is not configured. Set the required API key in environment." : message },
      { status: isMissingKey ? 503 : 500 }
    );
  }
}
