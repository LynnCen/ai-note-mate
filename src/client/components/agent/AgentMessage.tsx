"use client";

import type { AgentMessage as AgentMessageType } from "@/types/agent";
import { MarkdownPreview } from "@client/components/notes/MarkdownPreview";

export function AgentMessage({ message }: { message: AgentMessageType }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-foreground text-background"
            : "bg-muted text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <MarkdownPreview content={message.content} />
        )}
      </div>
    </div>
  );
}
