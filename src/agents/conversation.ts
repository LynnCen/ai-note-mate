/**
 * ReAct conversation runner.
 *
 * Flow per turn:
 *  1. Build messages (system prompt + history + new user msg)
 *  2. Call LLM → collect full response → parse into ReAct steps
 *  3. If Action found: execute tool → inject Observation → goto 2
 *  4. If Answer found: yield answer event and return
 *  5. Max 5 iterations guard → yield error event
 *
 * Each step is yielded as a Server-Sent Event so the UI can render
 * thought / action / observation in real time.
 */
import { streamChat } from "@server/llm";
import { parseChunk } from "@server/stream-utils";
import type { ChatMessage } from "@server/llm/types";
import { buildReActSystemPrompt, parseReActResponse, hasAnswer } from "./react-engine";
import { executeAgentTool, AGENT_TOOLS } from "./tool-registry";
import type { AgentContext } from "./types";
import type { Note } from "@/types/note";

export interface ConversationRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: AgentContext;
  allNotes: Note[];
}

const MAX_ITERATIONS = 5;

/**
 * Collect all text chunks from the LLM ReadableStream.
 * The stream emits "data: {\"content\":\"...\"}\n\n" SSE lines.
 */
async function collectStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const chunk = parseChunk(part);
        if (chunk) text += chunk;
      }
    }
    if (done) {
      // flush remaining buffer
      if (buffer.trim()) {
        const chunk = parseChunk(buffer);
        if (chunk) text += chunk;
      }
      break;
    }
  }

  return text;
}

/**
 * Async generator that runs the ReAct loop and yields SSE lines.
 *
 * Each yielded string is a complete SSE block, e.g.:
 *   "event: thought\ndata: {\"content\":\"...\"}\n\n"
 */
export async function* runReActLoop(
  req: ConversationRequest
): AsyncGenerator<string> {
  const { messages, context, allNotes } = req;

  const noteContext =
    context.noteContent !== null
      ? { title: context.noteTitle ?? "", content: context.noteContent }
      : null;

  const systemPrompt = buildReActSystemPrompt(AGENT_TOOLS);

  // Build the LLM message history
  const history: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Call LLM and collect full response
    const stream = await streamChat(history, undefined);
    const llmOutput = await collectStreamText(stream);

    if (!llmOutput.trim()) {
      yield sseEvent("error", { content: "LLM 返回空响应，请重试。" });
      return;
    }

    // Parse the LLM response into ReAct steps
    const steps = parseReActResponse(llmOutput);

    // Track if this iteration triggered any tool call
    let calledTool = false;

    for (const step of steps) {
      if (step.type === "thought") {
        yield sseEvent("thought", { content: step.content });
      } else if (step.type === "action") {
        yield sseEvent("action", {
          toolName: step.toolName,
          content: step.toolInput,
        });

        // Execute the tool
        const observation = await executeAgentTool(
          step.toolName,
          step.toolInput,
          noteContext,
          allNotes
        );

        yield sseEvent("observation", {
          toolName: step.toolName,
          content: observation,
        });

        // Inject assistant output + observation back into history
        history.push({ role: "assistant", content: llmOutput });
        history.push({
          role: "user",
          content: `<Observation tool="${step.toolName}">\n${observation}\n</Observation>\n\n请根据以上信息继续。`,
        });

        calledTool = true;
        // Only process the first action per iteration; re-enter loop
        break;
      } else if (step.type === "answer") {
        yield sseEvent("answer", { content: step.content });
        return;
      }
    }

    // If LLM gave only thoughts and no action / answer, treat as final answer
    if (!calledTool && !hasAnswer(steps)) {
      const thoughtContent = steps
        .filter((s) => s.type === "thought")
        .map((s) => s.content)
        .join("\n\n");
      yield sseEvent("answer", {
        content: thoughtContent || llmOutput,
      });
      return;
    }
  }

  yield sseEvent("error", { content: "Agent 达到最大迭代次数，请重新提问。" });
}

function sseEvent(event: string, data: Record<string, string>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
