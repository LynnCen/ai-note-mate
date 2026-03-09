import { describe, it, expect } from "vitest";
import type { ToolDefinition } from "@server/llm/types";

describe("tool-calling provider - type shapes", () => {
  it("tool definition has correct OpenAI shape", () => {
    const tool: ToolDefinition = {
      type: "function",
      function: {
        name: "search_notes",
        description: "Search notes",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    };
    expect(tool.type).toBe("function");
    expect(tool.function.name).toBe("search_notes");
    expect(tool.function.parameters.required).toContain("query");
  });

  it("tool with enum parameter", () => {
    const tool: ToolDefinition = {
      type: "function",
      function: {
        name: "draft_document",
        description: "Draft a document",
        parameters: {
          type: "object",
          properties: {
            template: { type: "string", enum: ["meeting", "tech", "weekly"] },
            title: { type: "string" },
          },
          required: ["template", "title"],
        },
      },
    };
    expect(tool.function.parameters.properties.template.enum).toContain("meeting");
  });
});
