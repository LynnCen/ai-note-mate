"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import type { AgentMessage as AgentMessageType, AgentEvent } from "@/types/agent";

export interface AgentChatPanelProps {
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
  onApplyToEditor?: (content: string) => void;
}

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
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Cleanup in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (userText: string) => {
      // Cancel any in-progress request before starting a new one
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMsg: AgentMessageType = {
        id: `msg-${Date.now()}`,
        role: "user",
        events: [],
        fullContent: userText,
        isDone: true,
        createdAt: new Date().toISOString(),
      };

      const conversationHistory = [...messages, userMsg];
      setMessages(conversationHistory);
      setStreaming(true);

      const assistantId = `msg-${Date.now() + 1}`;
      const assistantPlaceholder: AgentMessageType = {
        id: assistantId,
        role: "assistant",
        events: [],
        fullContent: "",
        isDone: false,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantPlaceholder]);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: conversationHistory.map((m) => ({
              role: m.role,
              content: m.fullContent,
            })),
            noteId,
            noteTitle,
            noteContent,
            allNotes: notes.filter((n) => !n.id.startsWith("local-")),
          }),
        });

        if (!res.ok || !res.body) {
          appendEvent(assistantId, { type: "error", content: "请求失败，请重试。" });
          markDone(assistantId);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let rawBuffer = "";
        let pendingEventType: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            rawBuffer += decoder.decode(value, { stream: true });
            const lines = rawBuffer.split("\n");
            rawBuffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                pendingEventType = line.slice(7).trim();
              } else if (line.startsWith("data: ") && pendingEventType) {
                processSSELine(assistantId, pendingEventType, line.slice(6));
                pendingEventType = null;
              }
            }
          }
          if (done) break;
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // User cancelled — mark done without an error message
          markDone(assistantId);
          return;
        }
        appendEvent(assistantId, { type: "error", content: "请求出错，请重试。" });
        markDone(assistantId);
        console.error("[AgentChatPanel] fetch error:", err);
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setStreaming(false);
      }
    },
    [messages, noteId, noteTitle, noteContent, notes]
  );

  function processSSELine(
    assistantId: string,
    eventType: string,
    dataStr: string
  ) {
    let data: Record<string, string> = {};
    try {
      data = JSON.parse(dataStr) as Record<string, string>;
    } catch {
      return;
    }

    switch (eventType) {
      case "content_delta":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  fullContent: m.fullContent + (data.content ?? ""),
                  events: [
                    ...m.events,
                    { type: "content_delta" as const, content: data.content ?? "" },
                  ],
                }
              : m
          )
        );
        break;

      case "tool_call_start":
        appendEvent(assistantId, {
          type: "tool_call_start",
          callId: data.callId,
          toolName: data.toolName,
          toolInput: data.toolInput,
        });
        break;

      case "tool_result":
        appendEvent(assistantId, {
          type: "tool_result",
          callId: data.callId,
          toolName: data.toolName,
          content: data.content,
        });
        break;

      case "done":
        markDone(assistantId);
        break;

      case "error":
        appendEvent(assistantId, {
          type: "error",
          content: data.message ?? "发生错误",
        });
        markDone(assistantId);
        break;
    }
  }

  function appendEvent(assistantId: string, event: AgentEvent) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, events: [...m.events, event] } : m
      )
    );
  }

  function markDone(assistantId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, isDone: true } : m))
    );
  }

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
          disabled={streaming}
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
              可以调用工具搜索笔记、读取当前文档、生成文档草稿
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

      {/* Stop-generating bar — shown above input when streaming */}
      {streaming && (
        <div className="shrink-0 flex items-center justify-center border-t border-border bg-muted/50 px-4 py-2">
          <button
            type="button"
            onClick={stopStreaming}
            className="flex items-center gap-1.5 rounded-md border border-destructive/50 bg-background px-3 py-1.5 text-xs font-medium text-destructive shadow-sm hover:bg-destructive/5 transition-colors"
          >
            <span className="inline-block h-2 w-2 rounded-sm bg-destructive" />
            停止生成
          </button>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0">
        <AgentInput onSend={sendMessage} disabled={streaming} />
      </div>
    </div>
  );
}
