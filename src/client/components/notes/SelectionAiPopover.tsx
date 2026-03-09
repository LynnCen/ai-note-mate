"use client";

import { useEffect, useRef } from "react";
import { Button } from "@client/components/ui/button";

export type AiAction = "polish" | "rewrite" | "summarize" | "expand" | "translate";

const ACTION_LABELS: Record<AiAction, string> = {
  polish: "AI 润色",
  rewrite: "AI 改文",
  summarize: "AI 总结",
  expand: "AI 扩写",
  translate: "AI 翻译",
};

export interface SelectionAiPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: { top: number; left: number } | null;
  onAction: (action: AiAction) => void;
}

export function SelectionAiPopover({
  open,
  onOpenChange,
  position,
  onAction,
}: SelectionAiPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onOpenChange]);

  if (!open || !position) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-md"
      style={{
        top: Math.max(8, position.top - 44),
        left: position.left,
        transform: "translateX(-50%)",
      }}
      role="toolbar"
      aria-label="AI 操作"
    >
      {(Object.keys(ACTION_LABELS) as AiAction[]).map((action) => (
        <Button
          key={action}
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            onAction(action);
            onOpenChange(false);
          }}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
    </div>
  );
}
