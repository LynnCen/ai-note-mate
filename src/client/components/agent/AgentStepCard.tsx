"use client";

import { useState } from "react";
import { MarkdownPreview } from "@client/components/notes/MarkdownPreview";
import type { AgentStep } from "@/types/agent";

const STEP_CONFIG = {
  thought: {
    label: "💭 思考",
    className:
      "border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30",
    labelClass: "text-blue-700 dark:text-blue-400",
    collapsible: true,
  },
  action: {
    label: "🔧 调用工具",
    className:
      "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30",
    labelClass: "text-amber-700 dark:text-amber-400",
    collapsible: false,
  },
  observation: {
    label: "📋 工具结果",
    className:
      "border-green-200 bg-green-50/60 dark:border-green-800 dark:bg-green-950/30",
    labelClass: "text-green-700 dark:text-green-400",
    collapsible: true,
  },
  answer: {
    label: "",
    className: "",
    labelClass: "",
    collapsible: false,
  },
  error: {
    label: "⚠️ 错误",
    className:
      "border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30",
    labelClass: "text-red-700 dark:text-red-400",
    collapsible: false,
  },
};

export interface AgentStepCardProps {
  step: AgentStep;
  onApplyToEditor?: (content: string) => void;
}

export function AgentStepCard({ step, onApplyToEditor }: AgentStepCardProps) {
  const [collapsed, setCollapsed] = useState(true);
  const cfg = STEP_CONFIG[step.type];

  // Answer renders as plain markdown bubble
  if (step.type === "answer") {
    return (
      <div className="rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground">
        <MarkdownPreview content={step.content} />
        {onApplyToEditor && step.content && (
          <button
            type="button"
            onClick={() => onApplyToEditor(step.content)}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            应用到编辑器 →
          </button>
        )}
      </div>
    );
  }

  const displayContent =
    step.type === "action"
      ? `**工具:** \`${step.toolName}\`\n\`\`\`json\n${step.content}\n\`\`\``
      : step.content;

  const headerLabel =
    step.type === "action" && step.toolName
      ? `${cfg.label}: ${step.toolName}`
      : cfg.label;

  return (
    <div className={`rounded-md border text-xs ${cfg.className}`}>
      <button
        type="button"
        className={`flex w-full items-center justify-between px-3 py-1.5 font-medium ${cfg.labelClass} ${
          cfg.collapsible ? "cursor-pointer" : "cursor-default"
        }`}
        onClick={() => cfg.collapsible && setCollapsed((v) => !v)}
      >
        <span>{headerLabel}</span>
        {cfg.collapsible && (
          <span className="ml-2 text-[10px] opacity-50">
            {collapsed ? "▶ 展开" : "▼ 收起"}
          </span>
        )}
      </button>
      {(!cfg.collapsible || !collapsed) && (
        <div className="border-t border-current/10 px-3 py-2 opacity-85">
          <MarkdownPreview content={displayContent} />
        </div>
      )}
    </div>
  );
}
