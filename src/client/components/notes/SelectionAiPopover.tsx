"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@client/components/ui/button";

export type AiAction = "polish" | "rewrite" | "summarize" | "expand" | "translate";

const ACTION_LABELS: Record<AiAction, string> = {
  polish: "AI 润色",
  rewrite: "AI 改写",
  summarize: "AI 总结",
  expand: "AI 扩写",
  translate: "AI 翻译",
};

export interface SelectionAiPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** DOMRect of the selected text range */
  anchorRect: DOMRect | null;
  onAction: (action: AiAction) => void;
}

const POPOVER_HEIGHT = 44;
const POPOVER_GAP = 8;

export function SelectionAiPopover({
  open,
  onOpenChange,
  anchorRect,
  onAction,
}: SelectionAiPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRect) {
      setPos(null);
      return;
    }
    const popoverWidth = containerRef.current?.offsetWidth ?? 280;
    const spaceAbove = anchorRect.top;

    // Prefer above selection; fall back to below when there isn't enough room
    const preferAbove = spaceAbove >= POPOVER_HEIGHT + POPOVER_GAP;

    const top = preferAbove
      ? anchorRect.top - POPOVER_HEIGHT - POPOVER_GAP + window.scrollY
      : anchorRect.bottom + POPOVER_GAP + window.scrollY;

    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - popoverWidth - 8,
        anchorRect.left + anchorRect.width / 2 - popoverWidth / 2
      )
    );

    setPos({ top, left });
  }, [open, anchorRect]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-lg"
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { visibility: "hidden", top: 0, left: 0 }
      }
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
