/**
 * Server-side env helper. Use in API routes and server components only.
 * Do not expose API keys to the client; avoid NEXT_PUBLIC_ for secrets.
 */

export type LLMProvider = "openai" | "deepseek" | "groq" | (string & {});

function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

/** LLM provider from LLM_PROVIDER (e.g. "openai", "deepseek"). */
export function getLLMProvider(): LLMProvider | undefined {
  const v = getEnvVar("LLM_PROVIDER");
  return v?.toLowerCase() ?? undefined;
}

/** OpenAI API key from OPENAI_API_KEY. */
export function getOpenAIKey(): string | undefined {
  return getEnvVar("OPENAI_API_KEY");
}

/** DeepSeek API key from DEEPSEEK_API_KEY. */
export function getDeepSeekKey(): string | undefined {
  return getEnvVar("DEEPSEEK_API_KEY");
}

/** Groq API key from GROQ_API_KEY. */
export function getGroqKey(): string | undefined {
  return getEnvVar("GROQ_API_KEY");
}

export interface Env {
  llmProvider: LLMProvider | undefined;
  openaiKey: string | undefined;
  deepSeekKey: string | undefined;
  groqKey: string | undefined;
}

/** Single object with all server-side env values (type-safe). */
export function getEnv(): Env {
  return {
    llmProvider: getLLMProvider(),
    openaiKey: getOpenAIKey(),
    deepSeekKey: getDeepSeekKey(),
    groqKey: getGroqKey(),
  };
}
