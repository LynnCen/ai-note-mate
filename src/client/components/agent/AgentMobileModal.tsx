"use client";

import { useEffect } from "react";
import { AgentChatPanel } from "./AgentChatPanel";

export interface AgentMobileModalProps {
  open: boolean;
  onClose: () => void;
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
  onApplyToEditor?: (content: string) => void;
}

export function AgentMobileModal({
  open,
  onClose,
  noteId,
  noteTitle,
  noteContent,
  onApplyToEditor,
}: AgentMobileModalProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
      {/* Close bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <span className="text-sm font-semibold">Agent 对话</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="关闭 Agent 对话"
        >
          ✕ 关闭
        </button>
      </div>

      {/* Chat panel fills remaining screen height */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AgentChatPanel
          noteId={noteId}
          noteTitle={noteTitle}
          noteContent={noteContent}
          onApplyToEditor={(agentContent) => {
            onApplyToEditor?.(agentContent);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
