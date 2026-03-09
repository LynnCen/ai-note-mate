/**
 * Parses SSE or plain text from chunk. API sends "data: {\"content\":\"...\"}\n\n".
 * Returns extracted text or the chunk as-is if not SSE.
 */
export function parseChunk(chunk: string): string {
  const trimmed = chunk.trim();
  if (trimmed.startsWith("data:")) {
    const jsonStr = trimmed.slice(5).trim();
    if (jsonStr === "[DONE]") return "";
    try {
      const data = JSON.parse(jsonStr) as { content?: string };
      return typeof data.content === "string" ? data.content : "";
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
