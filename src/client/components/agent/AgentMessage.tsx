"use client";

import type { AgentMessage as AgentMessageType } from "@/types/agent";
import { AgentStepCard } from "./AgentStepCard";

export interface AgentMessageProps {
  message: AgentMessageType;
  onApplyToEditor?: (content: string) => void;
}

export function AgentMessage({ message, onApplyToEditor }: AgentMessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] rounded-lg bg-foreground px-3 py-2 text-sm text-background">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant: render step cards (thought/action/observation) + answer
  const steps = message.steps ?? [];
  const hasSteps = steps.length > 0;
  const hasContent = !!message.content;

  return (
    <div className="mb-4 space-y-1.5">
      {/* Intermediate reasoning steps */}
      {hasSteps && (
        <div className="space-y-1">
          {steps.map((step, i) => (
            <AgentStepCard
              key={i}
              step={step}
              onApplyToEditor={
                step.type === "answer" ? onApplyToEditor : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Final answer content (when streamed as plain content) */}
      {hasContent && !steps.some((s) => s.type === "answer") && (
        <div className="rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {onApplyToEditor && (
            <button
              type="button"
              onClick={() => onApplyToEditor(message.content)}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              应用到编辑器 →
            </button>
          )}
        </div>
      )}

      {/* Streaming placeholder when nothing yet */}
      {!hasSteps && !hasContent && (
        <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground animate-pulse">
          思考中…
        </div>
      )}
    </div>
  );
}
