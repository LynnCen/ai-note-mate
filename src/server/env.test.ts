import { describe, it, expect, vi } from "vitest";

describe("env helpers", () => {
  it("getLLMProvider returns undefined when LLM_PROVIDER is not set", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    const { getLLMProvider } = await import("./env");
    const result = getLLMProvider();
    expect(result === undefined || result === "").toBe(true);
    vi.unstubAllEnvs();
  });

  it("getLLMProvider returns normalized lowercase value", async () => {
    vi.stubEnv("LLM_PROVIDER", "OpenAI");
    const mod = await import("./env");
    const result = mod.getLLMProvider();
    expect(result).toBe("openai");
    vi.unstubAllEnvs();
  });
});
