import { describe, it, expect } from "vitest";
import { parseChunk } from "@server/stream-utils";

describe("parseChunk", () => {
  it("extracts content from SSE data line", () => {
    expect(parseChunk('data: {"content":"hello"}')).toBe("hello");
    expect(parseChunk('data: {"content":" world"}\n\n')).toBe(" world");
  });

  it("returns empty string for [DONE]", () => {
    expect(parseChunk("data: [DONE]")).toBe("");
    expect(parseChunk("data: [DONE]\n\n")).toBe("");
  });

  it("returns chunk as-is for non-SSE plain text", () => {
    expect(parseChunk("plain text")).toBe("plain text");
    expect(parseChunk("  some line  ")).toBe("some line");
  });

  it("returns empty string when content is missing or not string", () => {
    expect(parseChunk("data: {}")).toBe("");
    expect(parseChunk('data: {"content":123}')).toBe("");
  });

  it("returns trimmed chunk when SSE JSON is invalid", () => {
    expect(parseChunk("data: not json")).toBe("data: not json");
  });
});
