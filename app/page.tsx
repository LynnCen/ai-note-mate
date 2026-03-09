"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotesStore } from "@client/stores/useNotesStore";
import { ArrowRight, FileText, Plus, Sparkles, Send } from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays < 7) return `${diffDays} 天前`;
    return d.toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "";
  }
}

function summary(content: string, maxLen = 100): string {
  const stripped = content.replace(/^#{1,6}\s+/gm, "").replace(/[*_`]/g, "");
  const line = stripped.split("\n").find((l) => l.trim()) ?? "";
  return line.length <= maxLen ? line || "空白笔记" : line.slice(0, maxLen) + "…";
}

const QUICK_STARTS = [
  { label: "📋 会议纪要", prompt: "帮我创建一份会议纪要模板，包含议题、决策和待办事项" },
  { label: "💡 头脑风暴", prompt: "帮我进行头脑风暴，围绕一个新产品功能展开创意发散" },
  { label: "📝 技术文档", prompt: "帮我起草一份技术设计文档，包含背景、方案和实现细节" },
  { label: "📧 工作周报", prompt: "帮我写一份工作周报，梳理本周进展、问题和下周计划" },
  { label: "🧠 学习笔记", prompt: "帮我整理一份学习笔记，结构清晰，便于复习和回顾" },
  { label: "🎯 OKR 规划", prompt: "帮我制定季度 OKR，包含关键目标和可量化的结果指标" },
];

// ─── component ──────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const { notes, fetchNotes, createLocalDraft } = useNotesStore();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const persistedNotes = notes
    .filter((n) => !n.id.startsWith("local-"))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  /** Create a draft and go to detail — optionally with an Agent prompt */
  const createAndNavigate = useCallback(
    (agentPrompt?: string) => {
      setCreating(true);
      const draft = createLocalDraft();
      if (agentPrompt?.trim()) {
        sessionStorage.setItem(`agent-prompt:${draft.id}`, agentPrompt.trim());
      }
      router.push(`/note/${draft.id}`);
    },
    [createLocalDraft, router]
  );

  function handleSendToAgent() {
    if (!prompt.trim()) return;
    createAndNavigate(prompt.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendToAgent();
    }
  }

  function handleQuickStart(p: string) {
    setPrompt(p);
    textareaRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-muted/60 via-background to-background px-4 pt-16 pb-12 text-center">
        {/* Background decorations */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-20 left-1/4 h-48 w-48 rounded-full bg-violet-500/5 blur-2xl" />
          <div className="absolute top-16 right-1/4 h-32 w-32 rounded-full bg-blue-500/5 blur-2xl" />
        </div>

        <div className="relative mx-auto max-w-3xl">
          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            由 AI Agent 驱动的智能笔记
          </div>

          {/* Title */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            让每一个想法
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-500 to-blue-500 bg-clip-text text-transparent">
              都有落地的力量
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mb-8 max-w-xl text-base text-muted-foreground sm:text-lg">
            告诉 Agent 你的创作目标，它会帮你搜索知识库、起草内容、整理结构——
            你只需专注于思考。
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            {["🔍 搜索全部笔记", "✍️ AI 辅助创作", "📁 文档解析上传", "🛠️ 工具自动调用"].map((f) => (
              <span key={f} className="rounded-full border border-border bg-muted/40 px-3 py-1">
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI INPUT ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-10">
        {/* Quick-start chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {QUICK_STARTS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => handleQuickStart(q.prompt)}
              className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Input card */}
        <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="告诉 Agent 你想创作什么……&#10;（Enter 发送，Shift+Enter 换行）"
            rows={4}
            className="w-full resize-none rounded-2xl bg-transparent px-5 pt-5 pb-3 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none"
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3">
            <span className="text-xs text-muted-foreground/60">
              {prompt.length > 0 ? `${prompt.length} 字` : "输入内容，Agent 会自动起草笔记"}
            </span>

            <div className="flex items-center gap-2">
              {/* Direct create — no agent */}
              <button
                type="button"
                onClick={() => createAndNavigate()}
                disabled={creating}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                直接新建
              </button>

              {/* Send to Agent */}
              <button
                type="button"
                onClick={handleSendToAgent}
                disabled={!prompt.trim() || creating}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                发送给 Agent
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── NOTES LIST ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            最近笔记
          </h2>
          <span className="text-xs text-muted-foreground">
            {persistedNotes.length} 篇
          </span>
        </div>

        {persistedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">还没有笔记</p>
              <p className="mt-1 text-xs text-muted-foreground">
                在上方输入框中描述你的想法，或者点击「直接新建」
              </p>
            </div>
            <button
              type="button"
              onClick={() => createAndNavigate()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              新建第一篇笔记
            </button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {persistedNotes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/note/${note.id}`}
                  className="group flex h-full flex-col rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5"
                >
                  {/* Icon + date */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] text-muted-foreground/60">
                      {formatDate(note.updatedAt)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="mb-1.5 line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {note.title || "无标题"}
                  </h3>

                  {/* Excerpt */}
                  <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {summary(note.content)}
                  </p>

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-end">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50 group-hover:text-primary/60 transition-colors">
                      打开
                      <ArrowRight className="h-3 w-3 translate-x-0 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
