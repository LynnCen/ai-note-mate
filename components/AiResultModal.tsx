"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Line height for virtual list (px). Must match rendered line height. */
const VIRTUAL_LINE_HEIGHT_PX = 24;
/** Enable virtual scroll when line count exceeds this. */
const VIRTUAL_SCROLL_LINE_THRESHOLD = 500;
/** Extra lines to render above/below viewport in virtual list. */
const VIRTUAL_OVERSCAN = 40;

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
  const rafIdRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [visibleWindow, setVisibleWindow] = useState({ start: 0, end: 100 });

  const flushToState = useCallback(() => {
    setStreamedText(accumulatedRef.current);
    rafIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!stream) return;
    accumulatedRef.current = "";

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const scheduleFlush = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        flushToState();
      });
    };

    (async () => {
      setStreamedText("");
      setStreamDone(false);
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
                scheduleFlush();
              }
            }
          }
          if (done) {
            if (buffer) {
              const text = parseChunk(buffer);
              if (text) {
                accumulatedRef.current += text;
              }
            }
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            setStreamedText(accumulatedRef.current);
            setStreamDone(true);
            break;
          }
        }
      } catch {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setStreamedText(accumulatedRef.current);
        setStreamDone(true);
      }
    })();

    return () => {
      reader.cancel();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [stream, flushToState]);

  const handleAccept = useCallback(() => {
    onAccept(accumulatedRef.current);
  }, [onAccept]);

  const lines = streamedText.split("\n");
  const totalLines = lines.length;
  const useVirtualScroll = totalLines > VIRTUAL_SCROLL_LINE_THRESHOLD;
  const totalHeightPx = totalLines * VIRTUAL_LINE_HEIGHT_PX;

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      scrollRafRef.current = null;
      if (!el || !useVirtualScroll) return;
      const scrollTop = el.scrollTop;
      const clientHeight = el.clientHeight;
      const start = Math.max(0, Math.floor(scrollTop / VIRTUAL_LINE_HEIGHT_PX) - VIRTUAL_OVERSCAN);
      const visibleCount = Math.ceil(clientHeight / VIRTUAL_LINE_HEIGHT_PX);
      const end = Math.min(totalLines, start + visibleCount + VIRTUAL_OVERSCAN * 2);
      setVisibleWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    });
  }, [useVirtualScroll, totalLines]);

  useEffect(() => {
    if (!useVirtualScroll) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const clientHeight = el.clientHeight;
    const visibleCount = Math.ceil(clientHeight / VIRTUAL_LINE_HEIGHT_PX);
    setVisibleWindow({ start: 0, end: Math.min(totalLines, visibleCount + VIRTUAL_OVERSCAN * 2) });
  }, [useVirtualScroll, totalLines]);

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
          ref={scrollContainerRef}
          className="min-h-[120px] max-h-[50vh] flex-1 overflow-y-auto whitespace-pre-wrap wrap-break-word px-4 py-3 text-foreground"
          aria-live="polite"
          onScroll={useVirtualScroll ? handleScroll : undefined}
          style={useVirtualScroll ? { lineHeight: VIRTUAL_LINE_HEIGHT_PX } : undefined}
        >
          {useVirtualScroll ? (
            <div style={{ height: totalHeightPx }}>
              <div style={{ height: visibleWindow.start * VIRTUAL_LINE_HEIGHT_PX }} aria-hidden />
              <div style={{ height: (visibleWindow.end - visibleWindow.start) * VIRTUAL_LINE_HEIGHT_PX }}>
                {lines.slice(visibleWindow.start, visibleWindow.end).join("\n")}
              </div>
              <div style={{ height: (totalLines - visibleWindow.end) * VIRTUAL_LINE_HEIGHT_PX }} aria-hidden />
            </div>
          ) : (
            streamedText || (!streamDone ? "处理中…" : "")
          )}
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
