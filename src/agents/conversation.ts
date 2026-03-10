/**
 * Tool Calling Agent loop.
 *
 * Flow per turn:
 *  1. Build messages with system prompt + conversation history
 *  2. Call LLM with tool definitions via chatWithToolsStream
 *  3. Stream content deltas → yield SSE content_delta events immediately (no buffering)
 *  4. If finish_reason=tool_calls → execute tools → append tool messages → goto 2
 *  5. If finish_reason=stop → yield done event and return
 *  6. Max 5 iterations guard → yield error event
 *
 * AbortSignal is propagated all the way to the LLM fetch call, enabling
 * client-initiated cancellation to cleanly stop the loop.
 */
import { chatWithToolsStream } from "@server/llm";
import { extractToolCalls } from "@server/llm/providers/tool-calling";
import type { ChatMessage, ProviderStreamEvent, ToolCall } from "@server/llm/types";
import { executeAgentTool, AGENT_TOOLS } from "./tool-registry";
import type { AgentContext } from "./types";
import type { Note } from "@/types/note";
import { DOCUMENT_AGENT_SYSTEM } from "./document-agent/prompts";

export interface ConversationRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: AgentContext;
  allNotes: Note[];
  signal?: AbortSignal;
}

const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = DOCUMENT_AGENT_SYSTEM;

/**
 * Async generator that runs the Tool Calling loop and yields SSE strings.
 *
 * Each yielded string is a complete SSE block, e.g.:
 *   "event: content_delta\ndata: {\"content\":\"...\"}\n\n"
 */
export async function* runToolCallingLoop(
  req: ConversationRequest
): AsyncGenerator<string> {
  const { messages, context, allNotes, signal } = req;

  const noteContext =
    context.noteContent !== null
      ? { title: context.noteTitle ?? "", content: context.noteContent }
      : null;

  const history: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // In \"ask\" 模式下不使用任何工具，只做纯问答
  const toolsForThisConversation = context.mode === "ask" ? [] : AGENT_TOOLS;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return;

    const collectedEvents: ProviderStreamEvent[] = [];
    let assistantContent = "";

    for await (const event of chatWithToolsStream(
      history,
      toolsForThisConversation,
      signal,
      context.providerOverride
    )) {
      if (signal?.aborted) return;

      collectedEvents.push(event);

      switch (event.type) {
        case "content_delta":
          assistantContent += event.content;
          yield sseEvent("content_delta", { content: event.content });
          break;

        case "tool_call_start":
          yield sseEvent("tool_call_start", {
            callId: event.callId,
            toolName: event.toolName,
          });
          break;

        case "error":
          yield sseEvent("error", { message: event.message });
          return;

        // tool_call_args_delta and finish handled after loop
        default:
          break;
      }
    }

    if (signal?.aborted) return;

    const finishEvent = collectedEvents.find((e) => e.type === "finish");
    const finishReason =
      finishEvent?.type === "finish" ? finishEvent.reason : "stop";

    if (finishReason === "stop" || finishReason === "length") {
      yield sseEvent("done", {});
      return;
    }

    // Tool calls path
    const toolCalls = extractToolCalls(collectedEvents);

    if (toolCalls.length === 0) {
      yield sseEvent("done", {});
      return;
    }

    // Append assistant turn with proper tool_calls so the LLM knows
    // what tools it already called and won't repeat them.
    const toolCallsForHistory: ToolCall[] = toolCalls.map((tc) => ({
      id: tc.callId,
      type: "function",
      function: { name: tc.toolName, arguments: tc.argsJson },
    }));
    history.push({
      role: "assistant",
      content: assistantContent || null,
      tool_calls: toolCallsForHistory,
    });

    // Execute each tool and append results
    for (const tc of toolCalls) {
      if (signal?.aborted) return;

      const toolResult = await executeAgentTool(
        tc.toolName,
        tc.argsJson,
        noteContext,
        allNotes
      );

      yield sseEvent("tool_result", {
        callId: tc.callId,
        toolName: tc.toolName,
        content: toolResult,
      });

      history.push({
        role: "tool",
        content: toolResult,
        tool_call_id: tc.callId,
        name: tc.toolName,
      });
    }
    // Continue loop with updated history
  }

  yield sseEvent("error", { message: "Agent 达到最大迭代次数，请重新提问。" });
}

function sseEvent(event: string, data: Record<string, string>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
