"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseChunk } from "@server/stream-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";

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
  /** Optional: called when the user cancels before stream completes (aborts the fetch). */
  onCancel?: () => void;
}

export function AiResultModal({ stream, onAccept, onDiscard, onCancel }: AiResultModalProps) {
  const [streamedText, setStreamedText] = useState("");
  const [streamDone, setStreamDone] = useState(false);
  const accumulatedRef = useRef("");
  const rafIdRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [visibleWindow, setVisibleWindow] = useState({ start: 0, end: 100 });

  const flushToState = useCallback(() => {
    setStreamedText(accumulatedRef.current);
    rafIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!stream) return;
    accumulatedRef.current = "";

    const reader = stream.getReader();
    readerRef.current = reader;
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

      const finish = () => {
        if (buffer) {
          const text = parseChunk(buffer);
          if (text) accumulatedRef.current += text;
        }
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setStreamedText(accumulatedRef.current);
        setStreamDone(true);
      };

      try {
        outer: while (true) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              // Explicit LLM done signal — don't wait for TCP close
              if (line.trim() === "data: [DONE]") {
                finish();
                break outer;
              }
              const text = parseChunk(line);
              if (text) {
                accumulatedRef.current += text;
                scheduleFlush();
              }
            }
          }
          if (done) {
            finish();
            break;
          }
        }
      } catch {
        finish();
      }
    })();

    return () => {
      reader.cancel().catch(() => {});
      readerRef.current = null;
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
    <Dialog open={true} onOpenChange={(open) => { if (!open) { onCancel?.(); onDiscard(); } }}>
      <DialogContent
        showCloseButton={true}
        className="flex max-h-[85vh] max-w-xl flex-col gap-0 p-0"
        aria-describedby="ai-result-content"
      >
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle id="ai-result-title">AI 处理结果</DialogTitle>
        </DialogHeader>
        <div
          id="ai-result-content"
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
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          {/* Left: stop button while streaming */}
          <div>
            {!streamDone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { onCancel?.(); readerRef.current?.cancel().catch(() => {}); setStreamDone(true); }}
                className="text-destructive border-destructive/50 hover:bg-destructive/5"
              >
                停止生成
              </Button>
            )}
          </div>
          {/* Right: discard / accept */}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => { onCancel?.(); onDiscard(); }}>
              丢弃
            </Button>
            <Button type="button" onClick={handleAccept} disabled={!streamDone}>
              接受
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
