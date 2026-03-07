/**
 * POST /api/ai/stream — AI stream proxy. Uses server-side LLM key; streams
 * text via SSE. Body: { content: string, action?: "polish"|"rewrite"|"summarize"|"expand"|"translate" }.
 */

import { getGmlKey, getLLMProvider, getOpenAIKey, getDeepSeekKey } from "@/lib/env";
import { streamChat } from "@/lib/llm";
import { NextRequest } from "next/server";

const SYSTEM_PROMPTS: Record<string, string> = {
  polish:
    "You help polish and expand the user's note. Output only the improved text, no preamble or explanation.",
  rewrite:
    "Rewrite the user's text in a different style or phrasing. Output only the rewritten text, no preamble.",
  summarize:
    "Summarize the user's text concisely. Output only the summary, no preamble.",
  expand:
    "Expand the user's text with more detail and depth. Keep the same tone and meaning. Output only the expanded text, no preamble.",
  translate:
    "Translate the user's text to Chinese if it is in another language, or to English if it is in Chinese. Output only the translation, no preamble.",
};

function getRequiredKeyForProvider(provider: string): string | undefined {
  const normalized = provider?.trim().toLowerCase() ?? "openai";
  if (normalized === "gml") return getGmlKey();
  if (normalized === "openai") return getOpenAIKey();
  if (normalized === "deepseek") return getDeepSeekKey();
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const provider = getLLMProvider();
    const normalized = (provider?.trim().toLowerCase() || "openai") as string;
    const apiKey = getRequiredKeyForProvider(normalized);

    if (!apiKey?.trim()) {
      const providerHint =
        normalized === "gml"
          ? "LLM_PROVIDER=gml 且 GML_API_KEY=你的key"
          : normalized === "openai"
            ? "LLM_PROVIDER=openai 且 OPENAI_API_KEY=你的key"
            : normalized === "deepseek"
              ? "LLM_PROVIDER=deepseek 且 DEEPSEEK_API_KEY=你的key"
              : `LLM_PROVIDER 与对应 API Key`;
      return Response.json(
        {
          error: `AI 服务未配置：请在 .env.local 中设置 ${providerHint}，保存后重启开发服务器（npm run dev）。`,
        },
        { status: 503 }
      );
    }

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

    const actionRaw = body?.action;
    const action =
      typeof actionRaw === "string" && SYSTEM_PROMPTS[actionRaw]
        ? actionRaw
        : "polish";
    const systemPrompt = SYSTEM_PROMPTS[action];

    const stream = await streamChat(
      [
        { role: "system", content: systemPrompt },
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
      /is not set|API key|api key/i.test(message) ||
      message.includes("OPENAI_API_KEY") ||
      message.includes("DEEPSEEK_API_KEY") ||
      message.includes("GML_API_KEY");

    return Response.json(
      { error: isMissingKey ? "AI service is not configured. Set the required API key in environment." : message },
      { status: isMissingKey ? 503 : 500 }
    );
  }
}
