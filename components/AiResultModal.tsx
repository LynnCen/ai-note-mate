"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AiResultModalProps {
  stream: ReadableStream<Uint8Array> | null;
  onAccept: (content: string) => void;
  onDiscard: () => void;
}

/**
 * Parses SSE or plain text from chunk. API sends "data: {\"content\":\"...\"}\n\n".
 * Returns extracted text or the chunk as-is if not SSE.
 */
function parseChunk(chunk: string): string {
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

export function AiResultModal({ stream, onAccept, onDiscard }: AiResultModalProps) {
  const [streamedText, setStreamedText] = useState("");
  const [streamDone, setStreamDone] = useState(false);
  const accumulatedRef = useRef("");

  useEffect(() => {
    if (!stream) return;
    accumulatedRef.current = "";
    setStreamedText("");
    setStreamDone(false);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const text = parseChunk(line);
              if (text) {
                accumulatedRef.current += text;
                setStreamedText(accumulatedRef.current);
              }
            }
          }
          if (done) {
            if (buffer) {
              const text = parseChunk(buffer);
              if (text) {
                accumulatedRef.current += text;
                setStreamedText(accumulatedRef.current);
              }
            }
            setStreamDone(true);
            break;
          }
        }
      } catch {
        setStreamDone(true);
      }
    })();

    return () => {
      reader.cancel();
    };
  }, [stream]);

  const handleAccept = useCallback(() => {
    onAccept(accumulatedRef.current);
  }, [onAccept]);

  if (stream === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="ai-result-title">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
        <h2 id="ai-result-title" className="sr-only">
          AI 处理结果
        </h2>
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <span className="text-sm font-medium text-foreground">AI 处理结果</span>
        </div>
        <div
          className="min-h-[120px] max-h-[50vh] flex-1 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-foreground"
          aria-live="polite"
        >
          {streamedText || (!streamDone ? "处理中…" : "")}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            丢弃
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!streamDone}
            className="rounded-lg border border-zinc-300 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          >
            接受
          </button>
        </div>
      </div>
    </div>
  );
}
