import type { AgentTool } from "./tool-registry";

/**
 * Build the ReAct system prompt that instructs the LLM to use XML tags.
 */
export function buildReActSystemPrompt(tools: AgentTool[]): string {
  const toolDocs = tools
    .map(
      (t) =>
        `- **${t.name}**: ${t.description}\n  参数格式: ${t.parametersSchema}`
    )
    .join("\n");

  return `你是一个智能文档笔记助手，拥有以下工具可以调用：

${toolDocs}

**回复格式规则（严格遵守）：**
每次回复时，你必须按照以下 XML 格式进行推理和行动：

<Thought>在这里写下你的推理过程，分析用户意图，决定是否调用工具</Thought>
<Action tool="工具名称">{"参数": "值"}</Action>

收到工具结果后，继续推理：
<Thought>根据观察结果进一步推理</Thought>
<Answer>当你有足够信息时，在这里给出最终回答。支持 Markdown 格式。</Answer>

**规则：**
- 必须先输出 <Thought> 再决定是否调用工具
- 如果不需要工具，直接输出 <Thought> 后跟 <Answer>
- <Action> 中的内容必须是合法 JSON
- <Answer> 是对话的终点，出现后本轮结束
- 回复语言与用户保持一致`;
}

/** Parsed ReAct step from LLM output */
export type ParsedStep =
  | { type: "thought"; content: string }
  | { type: "action"; toolName: string; toolInput: string }
  | { type: "answer"; content: string }
  | { type: "error"; content: string };

/**
 * Parse LLM output into a sequence of ReAct steps.
 * Handles partial / streaming output gracefully.
 */
export function parseReActResponse(text: string): ParsedStep[] {
  const steps: ParsedStep[] = [];

  // Match <Thought>...</Thought>
  const thoughtRe = /<Thought>([\s\S]*?)<\/Thought>/g;
  let m: RegExpExecArray | null;
  while ((m = thoughtRe.exec(text)) !== null) {
    steps.push({ type: "thought", content: m[1].trim() });
  }

  // Match <Action tool="name">...</Action>
  const actionRe = /<Action\s+tool="([^"]+)">([\s\S]*?)<\/Action>/g;
  while ((m = actionRe.exec(text)) !== null) {
    steps.push({ type: "action", toolName: m[1].trim(), toolInput: m[2].trim() });
  }

  // Match <Answer>...</Answer>
  const answerRe = /<Answer>([\s\S]*?)<\/Answer>/g;
  while ((m = answerRe.exec(text)) !== null) {
    steps.push({ type: "answer", content: m[1].trim() });
  }

  // If nothing matched, treat the whole text as an answer (safety fallback)
  if (steps.length === 0 && text.trim()) {
    steps.push({ type: "answer", content: text.trim() });
  }

  return steps;
}

/**
 * Check whether the parsed steps contain a terminal Answer.
 */
export function hasAnswer(steps: ParsedStep[]): boolean {
  return steps.some((s) => s.type === "answer");
}
