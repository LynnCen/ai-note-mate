"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import { parseChunk } from "@server/stream-utils";
import type { AgentMessage as AgentMessageType } from "@/types/agent";

export interface AgentChatPanelProps {
  noteId: string | null;
  noteTitle: string;
  noteContent: string;
}

export function AgentChatPanel({ noteId, noteTitle, noteContent }: AgentChatPanelProps) {
  const { notes } = useNotesStore();
  const [messages, setMessages] = useState<AgentMessageType[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息到来时自动滚到底部
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

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setStreaming(true);

      // 先占位 assistant 消息，流式追加内容
      const assistantId = `msg-${Date.now() + 1}`;
      const assistantMsg: AgentMessageType = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            noteId,
            noteTitle,
            noteContent,
            // 只传已持久化的笔记，不含本地草稿
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
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              const text = parseChunk(part);
              if (text) {
                accumulated += text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m
                  )
                );
              }
            }
          }
          if (done) {
            // 处理最后剩余 buffer
            if (buffer) {
              const text = parseChunk(buffer);
              if (text) {
                accumulated += text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m
                  )
                );
              }
            }
            break;
          }
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "请求出错，请重试。" } : m
          )
        );
      } finally {
        setStreaming(false);
      }
    },
    [messages, noteId, noteTitle, noteContent, notes]
  );

  return (
    <div className="flex h-full flex-col">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <h2 className="text-sm font-medium">Agent 对话</h2>
        <button
          type="button"
          onClick={() => setMessages([])}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          清空
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="mt-8 space-y-2 text-center text-xs text-muted-foreground px-4">
            <p>你好！我是 Agent，我可以：</p>
            <ul className="text-left space-y-1 mt-2">
              <li>📖 分析当前笔记内容</li>
              <li>🔍 搜索你的其他笔记</li>
              <li>📝 帮你起草文档模板</li>
            </ul>
          </div>
        ) : (
          messages.map((m) => <AgentMessage key={m.id} message={m} />)
        )}
        {streaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start mb-3">
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground animate-pulse">
              思考中…
            </div>
          </div>
        )}
      </div>

      {/* 输入框 */}
      <div className="shrink-0">
        <AgentInput onSend={sendMessage} disabled={streaming} />
      </div>
    </div>
  );
}
