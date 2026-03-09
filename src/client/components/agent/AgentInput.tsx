"use client";

import { useRef, useState } from "react";
import { Button } from "@client/components/ui/button";

export interface AgentInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function AgentInput({ onSend, disabled }: AgentInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="问问 Agent… (Enter 发送，Shift+Enter 换行)"
        rows={2}
        className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      <Button
        type="button"
        size="sm"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
      >
        发送
      </Button>
    </div>
  );
}
