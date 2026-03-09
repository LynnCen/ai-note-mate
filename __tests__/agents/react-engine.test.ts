import { describe, it, expect } from "vitest";
import { parseReActResponse, buildReActSystemPrompt } from "@agents/react-engine";
import { AGENT_TOOLS } from "@agents/tool-registry";

describe("parseReActResponse", () => {
  it("parses a Thought block", () => {
    const text = "<Thought>需要先读取笔记内容</Thought>";
    const steps = parseReActResponse(text);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ type: "thought", content: "需要先读取笔记内容" });
  });

  it("parses an Action block", () => {
    const text = '<Action tool="read_note">{}</Action>';
    const steps = parseReActResponse(text);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "action", toolName: "read_note" });
  });

  it("parses an Answer block", () => {
    const text = "<Answer>这是最终答案</Answer>";
    const steps = parseReActResponse(text);
    expect(steps[0]).toEqual({ type: "answer", content: "这是最终答案" });
  });

  it("parses multiple blocks in sequence", () => {
    const text = `<Thought>思考中</Thought>\n<Action tool="search_notes">{"query":"React"}</Action>`;
    const steps = parseReActResponse(text);
    expect(steps).toHaveLength(2);
    expect(steps[0].type).toBe("thought");
    expect(steps[1].type).toBe("action");
  });

  it("falls back to answer for plain text", () => {
    const steps = parseReActResponse("这是直接回答");
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ type: "answer", content: "这是直接回答" });
  });
});

describe("buildReActSystemPrompt", () => {
  it("includes tool names in the system prompt", () => {
    const prompt = buildReActSystemPrompt(AGENT_TOOLS);
    expect(prompt).toContain("read_note");
    expect(prompt).toContain("search_notes");
    expect(prompt).toContain("draft_document");
  });

  it("includes XML format instructions", () => {
    const prompt = buildReActSystemPrompt(AGENT_TOOLS);
    expect(prompt).toContain("<Thought>");
    expect(prompt).toContain("<Action");
    expect(prompt).toContain("<Answer>");
  });
});
