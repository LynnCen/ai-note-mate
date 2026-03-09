import { NextResponse } from "next/server";
import { getOpenAIKey, getDeepSeekKey, getGmlKey, getGroqKey } from "@server/env";

export async function GET() {
  const providers: string[] = [];
  if (getOpenAIKey()) providers.push("openai");
  if (getDeepSeekKey()) providers.push("deepseek");
  if (getGmlKey()) providers.push("gml");
  if (getGroqKey()) providers.push("groq");
  return NextResponse.json({ providers });
}
