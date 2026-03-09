import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module before importing conversation
vi.mock("@server/llm", () => ({
  chatWithToolsStream: vi.fn(),
}));

// Mock env so the provider routing doesn't fail
vi.mock("@server/env", () => ({
  getLLMProvider: () => "openai",
  getOpenAIKey: () => "test-key",
  getDeepSeekKey: () => undefined,
}));

import { runToolCallingLoop } from "@agents/conversation";
import { chatWithToolsStream } from "@server/llm";
import type { ProviderStreamEvent } from "@server/llm/types";

async function collectSSE(
  gen: AsyncGenerator<string>
): Promise<string[]> {
  const events: string[] = [];
  for await (const chunk of gen) {
    events.push(chunk);
  }
  return events;
}

function makeStream(events: ProviderStreamEvent[]) {
  return async function* () {
    for (const e of events) yield e;
  };
}

describe("runToolCallingLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields content_delta and done for a plain answer", async () => {
    vi.mocked(chatWithToolsStream).mockImplementation(
      makeStream([
        { type: "content_delta", content: "Hello, " },
        { type: "content_delta", content: "world!" },
        { type: "finish", reason: "stop" },
      ])
    );

    const events = await collectSSE(
      runToolCallingLoop({
        messages: [{ role: "user", content: "Hi" }],
        context: { noteId: null, noteContent: null, noteTitle: null },
        allNotes: [],
      })
    );

    const types = events.map((e) => e.match(/^event: (\w+)/)?.[1]);
    expect(types).toContain("content_delta");
    expect(types).toContain("done");
    expect(types).not.toContain("error");

    // Check content is streamed correctly
    const deltaEvents = events.filter((e) => e.includes("event: content_delta"));
    expect(deltaEvents[0]).toContain("Hello, ");
    expect(deltaEvents[1]).toContain("world!");
  });

  it("yields error event when LLM emits error", async () => {
    vi.mocked(chatWithToolsStream).mockImplementation(
      makeStream([{ type: "error", message: "LLM API error 500" }])
    );

    const events = await collectSSE(
      runToolCallingLoop({
        messages: [{ role: "user", content: "Hi" }],
        context: { noteId: null, noteContent: null, noteTitle: null },
        allNotes: [],
      })
    );

    const types = events.map((e) => e.match(/^event: (\w+)/)?.[1]);
    expect(types).toContain("error");
    expect(types).not.toContain("done");
    expect(events.some((e) => e.includes("LLM API error 500"))).toBe(true);
  });

  it("stops immediately when signal is aborted", async () => {
    const controller = new AbortController();

    vi.mocked(chatWithToolsStream).mockImplementation(async function* () {
      controller.abort(); // abort during first LLM call
      yield { type: "content_delta", content: "partial" } as ProviderStreamEvent;
      yield { type: "finish", reason: "stop" } as ProviderStreamEvent;
    });

    const events = await collectSSE(
      runToolCallingLoop({
        messages: [{ role: "user", content: "Hi" }],
        context: { noteId: null, noteContent: null, noteTitle: null },
        allNotes: [],
        signal: controller.signal,
      })
    );

    // With abort, loop exits early — no done event expected
    expect(events.length).toBe(0);
  });

  it("yields tool_call_start and tool_result when LLM calls a tool", async () => {
    let callCount = 0;
    vi.mocked(chatWithToolsStream).mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        // First call: LLM requests tool
        yield { type: "tool_call_start", callId: "call_1", toolName: "read_note" } as ProviderStreamEvent;
        yield { type: "tool_call_args_delta", callId: "call_1", argsDelta: "{}" } as ProviderStreamEvent;
        yield { type: "finish", reason: "tool_calls" } as ProviderStreamEvent;
      } else {
        // Second call: LLM answers after tool result
        yield { type: "content_delta", content: "The note says..." } as ProviderStreamEvent;
        yield { type: "finish", reason: "stop" } as ProviderStreamEvent;
      }
    });

    const events = await collectSSE(
      runToolCallingLoop({
        messages: [{ role: "user", content: "What is in the note?" }],
        context: { noteId: "1", noteContent: "Some note content", noteTitle: "My Note" },
        allNotes: [],
      })
    );

    const types = events.map((e) => e.match(/^event: (\w+)/)?.[1]);
    expect(types).toContain("tool_call_start");
    expect(types).toContain("tool_result");
    expect(types).toContain("content_delta");
    expect(types).toContain("done");
    expect(callCount).toBe(2); // LLM called twice (once for tool, once for answer)
  });
});
