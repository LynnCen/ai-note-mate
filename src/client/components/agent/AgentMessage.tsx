"use client";

import { AgentEventCard } from "./AgentEventCard";
import type { AgentMessage as AgentMessageType } from "@/types/agent";

export interface AgentMessageProps {
  message: AgentMessageType;
  onApplyToEditor?: (content: string) => void;
}

export function AgentMessage({ message, onApplyToEditor }: AgentMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.fullContent}
        </div>
      </div>
    );
  }

  // Assistant message
  const hasError = message.events.some((e) => e.type === "error");
  const isStreaming = !message.isDone;

  return (
    <div className="flex flex-col gap-1">
      {/* Tool call / result / error event cards */}
      {message.events
        .filter((e) => e.type !== "content_delta" && e.type !== "done")
        .map((event, i) => (
          <AgentEventCard
            key={i}
            event={event}
            onApplyToEditor={onApplyToEditor}
          />
        ))}

      {/* Flowing content text */}
      {message.fullContent && (
        <div className="rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
          <p className="whitespace-pre-wrap">{message.fullContent}</p>

          {/* Streaming cursor */}
          {isStreaming && !hasError && (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-foreground/60 align-middle" />
          )}

          {/* Apply to editor — only when done and no error */}
          {message.isDone && !hasError && onApplyToEditor && (
            <button
              type="button"
              onClick={() => onApplyToEditor(message.fullContent)}
              className="mt-2 block rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90"
            >
              应用到编辑器
            </button>
          )}
        </div>
      )}

      {/* Empty streaming placeholder (no content yet) */}
      {!message.fullContent && isStreaming && !hasError && (
        <div className="rounded-2xl bg-muted px-3 py-2 text-sm">
          <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-foreground/60 align-middle" />
        </div>
      )}
    </div>
  );
}
