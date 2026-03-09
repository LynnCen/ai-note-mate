"use client";

import { useRef, useState, useCallback } from "react";
import { Button } from "@client/components/ui/button";
import { Square, Send, Plus, X, FileText, Loader2 } from "lucide-react";

export interface ContextChip {
  type: "note" | "file";
  label: string;
  content?: string;
  /** true while file content is being read */
  loading?: boolean;
}

export interface AgentInputProps {
  onSend: (message: string, contextChips: ContextChip[]) => void;
  onStop: () => void;
  streaming: boolean;
  /** Currently selected text from the editor; if set, shows as selection chip */
  selectedText?: string;
  /** Full note content — used as default "全文" chip value */
  noteContent?: string;
  /** Available models (provider ids) */
  availableModels?: string[];
  /** Currently selected model */
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

const MODEL_LABELS: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  gml: "GLM",
  groq: "Groq",
};

export function AgentInput({
  onSend,
  onStop,
  streaming,
  selectedText,
  noteContent = "",
  availableModels = [],
  selectedModel,
  onModelChange,
}: AgentInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultChip: ContextChip = selectedText
    ? {
        type: "note",
        label: `已选：${selectedText.slice(0, 15)}${selectedText.length > 15 ? "…" : ""}`,
        content: selectedText,
      }
    : { type: "note", label: "全文", content: noteContent };

  const [chips, setChips] = useState<ContextChip[]>([defaultChip]);

  function removeChip(idx: number) {
    setChips((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase();
    const chipKey = `${filename}-${Date.now()}`;

    // Show chip immediately with loading indicator
    setChips((prev) => [...prev, { type: "file", label: filename, loading: true }]);

    if (ext === "txt" || ext === "md") {
      // Read client-side — instant, no API needed
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
    } else if (ext === "pdf" || ext === "docx") {
      // Parse via API in background — chip already visible
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
          // Keep chip but mark as unreadable
          setChips((prev) =>
            prev.map((c) =>
              c.type === "file" && c.label === filename && c.loading
                ? { ...c, content: "[无法解析文件内容]", loading: false }
                : c
            )
          );
        });
    }

    void chipKey; // used for closure identity
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed, chips);
    setText("");
    textareaRef.current?.focus();
  }, [text, chips, streaming, onSend]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-background p-3 space-y-2">
      {/* Context chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
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
              <span className="max-w-[140px] truncate">{chip.label}</span>
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

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={streaming}
        placeholder="问问 Agent… (Enter 发送，Shift+Enter 换行)"
        rows={4}
        className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: file upload + model selector */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="附加文件（PDF / DOCX / TXT / MD）"
          >
            <Plus className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={handleFileUpload}
          />

          {availableModels.length > 1 && onModelChange && (
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Stop or Send */}
        {streaming ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={onStop}
            className="gap-1.5"
          >
            <Square className="h-3 w-3 fill-current" />
            停止
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={!text.trim()}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
