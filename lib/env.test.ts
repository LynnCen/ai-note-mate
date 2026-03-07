import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getLLMProvider,
  getOpenAIKey,
  getDeepSeekKey,
  getGroqKey,
  getGmlKey,
  getEnv,
} from "@/lib/env";

describe("lib/env", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GML_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns undefined when env vars are unset", () => {
    expect(getLLMProvider()).toBeUndefined();
    expect(getOpenAIKey()).toBeUndefined();
    expect(getDeepSeekKey()).toBeUndefined();
    expect(getGroqKey()).toBeUndefined();
    expect(getGmlKey()).toBeUndefined();
  });

  it("getEnv returns object with all getters", () => {
    const env = getEnv();
    expect(env).toHaveProperty("llmProvider");
    expect(env).toHaveProperty("openaiKey");
    expect(env).toHaveProperty("deepSeekKey");
    expect(env).toHaveProperty("groqKey");
    expect(env).toHaveProperty("gmlKey");
  });
});
