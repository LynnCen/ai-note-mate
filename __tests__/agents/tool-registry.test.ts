import { describe, it, expect } from "vitest";
import { executeAgentTool, AGENT_TOOLS } from "@agents/tool-registry";
import type { Note } from "@/types/note";

const note = { title: "测试", content: "React Hooks 介绍" };
const notes: Note[] = [
  {
    id: "1",
    title: "React",
    content: "useState useEffect",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("AGENT_TOOLS", () => {
  it("exports read_note, search_notes, draft_document", () => {
    expect(AGENT_TOOLS.map((t) => t.function.name)).toEqual(
      expect.arrayContaining(["read_note", "search_notes", "draft_document"])
    );
  });

  it("uses OpenAI function calling format", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(typeof tool.function.name).toBe("string");
      expect(typeof tool.function.description).toBe("string");
      expect(tool.function.parameters.type).toBe("object");
    }
  });
});

describe("executeAgentTool", () => {
  it("read_note returns note content", async () => {
    const result = await executeAgentTool("read_note", "{}", note, notes);
    expect(result).toContain("测试");
    expect(result).toContain("React Hooks");
  });

  it("search_notes finds matching notes", async () => {
    const result = await executeAgentTool(
      "search_notes",
      JSON.stringify({ query: "useState" }),
      note,
      notes
    );
    expect(result).toContain("React");
  });

  it("draft_document returns a meeting template", async () => {
    const result = await executeAgentTool(
      "draft_document",
      JSON.stringify({ template: "meeting", title: "周例会" }),
      note,
      notes
    );
    expect(result).toContain("会议纪要");
    expect(result).toContain("参会人员");
    expect(result).toContain("待办事项");
  });

  it("draft_document tech template includes provided title", async () => {
    const result = await executeAgentTool(
      "draft_document",
      JSON.stringify({ template: "tech", title: "系统设计" }),
      note,
      notes
    );
    expect(result).toContain("系统设计");
    expect(result).toContain("概述");
  });

  it("unknown tool returns error string", async () => {
    const result = await executeAgentTool("unknown_tool", "{}", note, notes);
    expect(result).toContain("未知工具");
  });
});
