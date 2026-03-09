"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import type { AgentMessage as AgentMessageType, AgentStep } from "@/types/agent";

export interface AgentChatPanelProps {
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
  /** Called when user clicks "应用到编辑器" on an answer step */
  onApplyToEditor?: (content: string) => void;
}

type SSEEventType = "thought" | "action" | "observation" | "answer" | "error";

export function AgentChatPanel({
  noteId,
  noteTitle,
  noteContent,
  onApplyToEditor,
}: AgentChatPanelProps) {
  const { notes } = useNotesStore();
  const [messages, setMessages] = useState<AgentMessageType[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(
    async (userText: string) => {
      const userMsg: AgentMessageType = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: userText,
        createdAt: new Date().toISOString(),
      };

      const conversationHistory = [...messages, userMsg];
      setMessages(conversationHistory);
      setStreaming(true);

      const assistantId = `msg-${Date.now() + 1}`;
      const assistantMsg: AgentMessageType = {
        id: assistantId,
        role: "assistant",
        content: "",
        steps: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, 60000);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: conversationHistory.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            noteId,
            noteTitle,
            noteContent,
            allNotes: notes.filter((n) => !n.id.startsWith("local-")),
          }),
        });

        if (!res.ok || !res.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: "请求失败，请重试。" } : m
            )
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let rawBuffer = "";
        let pendingEvent: SSEEventType | null = null;

        /**
         * Apply a parsed SSE event to the assistant message.
         * thought/action/observation → push to steps[]
         * answer → set content
         * error  → set content as error text
         */
        const applyEvent = (event: SSEEventType, dataStr: string) => {
          let data: Record<string, string> = {};
          try {
            data = JSON.parse(dataStr);
          } catch {
            // ignore malformed data
          }

          if (event === "answer") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: data.content ?? "" }
                  : m
              )
            );
            return;
          }

          if (event === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: data.content ?? "发生错误" }
                  : m
              )
            );
            return;
          }

          // thought / action / observation → append to steps
          const step: AgentStep = {
            type: event,
            content: data.content ?? "",
            ...(data.toolName ? { toolName: data.toolName } : {}),
          };

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, steps: [...(m.steps ?? []), step] }
                : m
            )
          );
        };

        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            rawBuffer += decoder.decode(value, { stream: true });
            const lines = rawBuffer.split("\n");
            rawBuffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                pendingEvent = line.slice(7).trim() as SSEEventType;
              } else if (line.startsWith("data: ") && pendingEvent) {
                applyEvent(pendingEvent, line.slice(6));
                pendingEvent = null;
              }
            }
          }
          if (done) break;
        }
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "请求超时，请稍后重试。"
            : "请求出错，请重试。";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: message } : m
          )
        );
      } finally {
        window.clearTimeout(timeoutId);
        setStreaming(false);
      }
    },
    [messages, noteId, noteTitle, noteContent, notes]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Agent 对话</span>
          {streaming && (
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
          )}
        </div>
        <button
          type="button"
          onClick={() => setMessages([])}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          清空
        </button>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 ? (
          <div className="mt-10 space-y-3 text-center px-4">
            <p className="text-sm font-medium text-foreground">你好！我是文档 Agent</p>
            <p className="text-xs text-muted-foreground">
              我会展示完整的思考过程：推理 → 调用工具 → 给出答案
            </p>
            <ul className="text-left space-y-2 mt-4 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span>📖</span>
                <span>分析并引用当前笔记内容</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🔍</span>
                <span>搜索你的所有笔记知识库</span>
              </li>
              <li className="flex items-start gap-2">
                <span>📝</span>
                <span>起草会议纪要、技术文档、周报</span>
              </li>
            </ul>
          </div>
        ) : (
          messages.map((m) => (
            <AgentMessage
              key={m.id}
              message={m}
              onApplyToEditor={onApplyToEditor}
            />
          ))
        )}
      </div>

      {/* Input */}
      <div className="shrink-0">
        <AgentInput onSend={sendMessage} disabled={streaming} />
      </div>
    </div>
  );
}
