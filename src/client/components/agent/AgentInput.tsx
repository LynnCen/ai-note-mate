"use client";

import { useRef, useState, useCallback } from "react";
import { Button } from "@client/components/ui/button";
import { Square, Send, Plus, X, FileText } from "lucide-react";

export interface ContextChip {
  type: "note" | "file";
  label: string;
  content?: string;
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
  const [uploading, setUploading] = useState(false);

  function removeChip(idx: number) {
    setChips((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/file/parse", { method: "POST", body: formData });
      if (!res.ok) return;
      const { text: fileText, filename } = (await res.json()) as {
        text: string;
        filename: string;
      };
      setChips((prev) => [...prev, { type: "file", label: filename, content: fileText }]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="max-w-[120px] truncate">{chip.label}</span>
              <button
                type="button"
                onClick={() => removeChip(i)}
                className="ml-0.5 rounded-full hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
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
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
            title="上传文件"
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
