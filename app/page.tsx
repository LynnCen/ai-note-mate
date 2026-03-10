"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotesStore } from "@client/stores/useNotesStore";
import { Popover, PopoverContent, PopoverTrigger } from "@client/components/ui/popover";
import {
  ArrowRight,
  Bot,
  Cpu,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  Sparkles,
  Send,
  X,
} from "lucide-react";
import type { ContextChip } from "@client/components/agent/AgentInput";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [mode, setMode] = useState<"agent" | "ask">("agent");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [modePopoverOpen, setModePopoverOpen] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Fetch available providers for model selector
  useEffect(() => {
    fetch("/api/ai/providers")
      .then((r) => r.json())
      .then((data: { providers: string[] }) => {
        setAvailableModels(data.providers);
        if (data.providers.length > 0) setSelectedModel(data.providers[0]);
      })
      .catch(() => {});
  }, []);

  const persistedNotes = notes
    .filter((n) => !n.id.startsWith("local-"))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  function removeChip(idx: number) {
    setChips((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase();
    const chipKey = `${filename}-${Date.now()}`;

    setChips((prev) => [...prev, { type: "file", label: filename, loading: true }]);

    if (ext === "txt" || ext === "md") {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        setChips((prev) =>
          prev.map((c) =>
            c.type === "file" && c.label === filename && c.loading
              ? { ...c, content: text, loading: false }
              : c
          )
        );
      };
      reader.readAsText(file);
    } else if (ext === "docx") {
      const formData = new FormData();
      formData.append("file", file);
      fetch("/api/file/parse", { method: "POST", body: formData })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then(({ text: fileText }: { text: string; filename: string }) => {
          setChips((prev) =>
            prev.map((c) =>
              c.type === "file" && c.label === filename && c.loading
                ? { ...c, content: fileText, loading: false }
                : c
            )
          );
        })
        .catch(() => {
          setChips((prev) =>
            prev.map((c) =>
              c.type === "file" && c.label === filename && c.loading
                ? { ...c, content: "[无法解析文件内容]", loading: false }
                : c
            )
          );
        });
    } else {
      // Unsupported type — keep chip, mark as unreadable
      setChips((prev) =>
        prev.map((c) =>
          c.type === "file" && c.label === filename && c.loading
            ? { ...c, content: "[暂不支持的文件类型]", loading: false }
            : c
        )
      );
    }

    void chipKey;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Create a draft and go to detail — optionally with an Agent prompt + config */
  const createAndNavigate = useCallback(
    (
      agentPrompt?: string,
      options?: {
        mode?: "agent" | "ask";
        provider?: string;
        attachments?: Array<{ filename: string; content: string }>;
      }
    ) => {
      setCreating(true);
      const draft = createLocalDraft();
      const draftId = draft.id;

      if (agentPrompt?.trim()) {
        sessionStorage.setItem(`agent-prompt:${draftId}`, agentPrompt.trim());
      }
      if (options?.mode) {
        sessionStorage.setItem(`agent-mode:${draftId}`, options.mode);
      }
      if (options?.provider) {
        sessionStorage.setItem(`agent-provider:${draftId}`, options.provider);
      }
      if (options?.attachments && options.attachments.length > 0) {
        sessionStorage.setItem(`agent-attachments:${draftId}`, JSON.stringify(options.attachments));
      }

      router.push(`/note/${draftId}`);
    },
    [createLocalDraft, router]
  );

  function handleSendToAgent() {
    if (!prompt.trim()) return;
    const attachments =
      chips
        .filter((c) => c.type === "file" && !c.loading && c.content)
        .map((c) => ({ filename: c.label, content: c.content ?? "" })) ?? [];
    createAndNavigate(prompt.trim(), {
      mode,
      provider: selectedModel,
      attachments,
    });
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
          {/* Context chips (attachments) */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-4">
              {chips.map((chip, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                    chip.loading
                      ? "border-border/50 bg-muted/30 text-muted-foreground/60"
                      : "border-border bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {chip.loading ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3 shrink-0" />
                  )}
                  <span className="max-w-[160px] truncate">{chip.label}</span>
                  {!chip.loading && (
                    <button
                      type="button"
                      onClick={() => removeChip(i)}
                      className="ml-0.5 rounded-full hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="告诉 Agent 你想创作什么……&#10;（Enter 发送，Shift+Enter 换行）"
            rows={4}
            className={`w-full resize-none rounded-2xl bg-transparent px-5 pb-3 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none ${
              chips.length > 0 ? "pt-2" : "pt-5"
            }`}
          />

          {/* Bottom toolbar — align with inner Agent UI: 左侧 文件/模式/模型，右侧 发送/新建 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-4 py-3">
            {/* Left: file upload + mode + model */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="附加文件（DOCX / TXT / MD）"
              >
                <Plus className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.txt,.md"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Agent / Ask 模式下拉 */}
              <Popover open={modePopoverOpen} onOpenChange={setModePopoverOpen}>
                <PopoverTrigger>
                  <div className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    {mode === "agent" ? (
                      <Bot className="h-3.5 w-3.5" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                    <span>{mode === "agent" ? "Agent 模式" : "Ask 模式"}</span>
                  </div>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" className="w-64 p-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("agent");
                      setModePopoverOpen(false);
                    }}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      mode === "agent" ? "bg-muted text-foreground" : "hover:bg-muted/70"
                    }`}
                  >
                    <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="block font-semibold text-foreground">Agent 模式</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        自动调用工具，读取笔记、搜索知识库并生成草稿。
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("ask");
                      setModePopoverOpen(false);
                    }}
                    className={`mt-1 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      mode === "ask" ? "bg-muted text-foreground" : "hover:bg-muted/70"
                    }`}
                  >
                    <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="block font-semibold text-foreground">Ask 模式</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        只进行对话问答，不调用工具，适合轻量提问。
                      </span>
                    </span>
                  </button>
                </PopoverContent>
              </Popover>

              {/* 模型选择下拉（provider） */}
              {availableModels.length > 0 && (
                <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                  <PopoverTrigger>
                    <div className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <Cpu className="h-3.5 w-3.5" />
                      <span>{selectedModel ?? "选择模型"}</span>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-64 p-2.5">
                    {availableModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setSelectedModel(m);
                          setModelPopoverOpen(false);
                        }}
                        className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          selectedModel === m ? "bg-muted text-foreground" : "hover:bg-muted/70"
                        }`}
                      >
                        <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          <span className="block font-semibold text-foreground">{m}</span>
                        </span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Right: create / send */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => createAndNavigate()}
                disabled={creating}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                直接新建
              </button>
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
