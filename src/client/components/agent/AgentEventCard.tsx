"use client";

import { useState } from "react";
import type { AgentEvent } from "@/types/agent";
import { AgentMarkdown } from "./AgentMarkdown";

interface AgentEventCardProps {
  event: AgentEvent;
  onApplyToEditor?: (content: string) => void;
}

const EVENT_CONFIG = {
  tool_call_start: {
    label: "🔧 调用工具",
    bgClass:
      "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    textClass: "text-amber-700 dark:text-amber-300",
    collapsible: true,
  },
  tool_result: {
    label: "📊 工具结果",
    bgClass:
      "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    textClass: "text-blue-700 dark:text-blue-300",
    collapsible: true,
  },
  error: {
    label: "❌ 错误",
    bgClass: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
    textClass: "text-red-700 dark:text-red-300",
    collapsible: false,
  },
} as const;

type ConfigKey = keyof typeof EVENT_CONFIG;

export function AgentEventCard({ event, onApplyToEditor }: AgentEventCardProps) {
  const [collapsed, setCollapsed] = useState(true);

  // content_delta and done are rendered by the parent as flowing text
  if (event.type === "content_delta" || event.type === "done") return null;

  const config = EVENT_CONFIG[event.type as ConfigKey];
  if (!config) return null;

  const isError = event.type === "error";
  const body = event.content ?? event.toolInput ?? "";
  const heading = event.toolName
    ? `${config.label}：${event.toolName}`
    : config.label;

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs my-1 ${config.bgClass}`}>
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-2 font-medium ${config.textClass}`}
        onClick={() => config.collapsible && setCollapsed((v) => !v)}
        disabled={!config.collapsible}
      >
        <span>{heading}</span>
        {config.collapsible && (
          <span className="opacity-60">{collapsed ? "▸" : "▾"}</span>
        )}
      </button>

      {(!config.collapsible || !collapsed) && body && (
        event.type === "tool_result" ? (
          <div className="mt-2 max-h-40 overflow-y-auto opacity-80">
            <AgentMarkdown content={body} />
          </div>
        ) : (
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] opacity-80 max-h-40 overflow-y-auto">
            {body}
          </pre>
        )
      )}

      {/* Apply to editor only for tool_result (never for error) */}
      {!isError &&
        event.type === "tool_result" &&
        body &&
        onApplyToEditor &&
        !collapsed && (
          <button
            type="button"
            onClick={() => onApplyToEditor(body)}
            className="mt-2 rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:opacity-90"
          >
            应用到编辑器
          </button>
        )}
    </div>
  );
}
