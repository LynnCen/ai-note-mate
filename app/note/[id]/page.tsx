"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useNotesStore } from "@client/stores/useNotesStore";
import { NoteEditor, type NoteEditorHandle } from "@client/components/notes/NoteEditor";
import { AiResultModal } from "@client/components/notes/AiResultModal";
import { SelectionAiPopover, type AiAction } from "@client/components/notes/SelectionAiPopover";
import { MarkdownPreview } from "@client/components/notes/MarkdownPreview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@client/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@client/components/ui/alert-dialog";
import { useUnsavedChanges } from "@client/hooks/useUnsavedChanges";
import { useResizablePanel } from "@client/hooks/useResizablePanel";
import { AgentChatPanel } from "@client/components/agent/AgentChatPanel";
import { AgentMobileModal } from "@client/components/agent/AgentMobileModal";
import type { Note } from "@/types/note";

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";
  const { notes, updateNote, deleteNote, fetchNotes, addNote, syncDraft } = useNotesStore();

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiStream, setAiStream] = useState<ReadableStream<Uint8Array> | null>(null);
  const [aiMeta, setAiMeta] = useState<{
    hadSelection: boolean;
    selectionStart: number;
    selectionEnd: number;
    contentAtClick: string;
  } | null>(null);
  const [selectionPopoverOpen, setSelectionPopoverOpen] = useState(false);
  const [selectionAnchorRect, setSelectionAnchorRect] = useState<DOMRect | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const editorRef = useRef<NoteEditorHandle>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const { panelWidth, onDividerMouseDown } = useResizablePanel();
  const [mobileAgentOpen, setMobileAgentOpen] = useState(false);

  // 有未保存更改时，刷新/关闭标签页前弹原生确认框
  useUnsavedChanges(isDirty);

  // 从 store 或远端加载笔记
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    // 本地草稿直接从 store 取
    if (id.startsWith("local-")) {
      const draft = notes.find((n) => n.id === id);
      if (draft) {
        setNote(draft);
        setTitle(draft.title);
        setContent(draft.content);
      }
      setLoading(false);
      return;
    }
    const fromStore = notes.find((n) => n.id === id);
    if (fromStore) {
      setNote(fromStore);
      setTitle(fromStore.title);
      setContent(fromStore.content);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/notes/${id}`);
        if (cancelled) return;
        if (res.status === 404) {
          router.replace("/");
          return;
        }
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = (await res.json()) as Note;
        setNote(data);
        setTitle(data.title);
        setContent(data.content);
        addNote(data);
      } catch {
        if (!cancelled) setLoading(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, notes, router, addNote]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setIsDirty(true);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    setIsDirty(true);
  };

  // 保存：草稿走 syncDraft（POST），已有笔记走 PUT
  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      if (id.startsWith("local-")) {
        // 先把标题/内容更新到本地 store，再同步到后端
        updateNote(id, { title, content });
        const saved = await syncDraft(id);
        if (saved) {
          setIsDirty(false);
          toast.success("笔记已保存");
          router.replace(`/note/${saved.id}`);
        } else {
          toast.error("保存失败，请重试");
        }
        return;
      }
      const res = await fetch(`/api/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (res.ok) {
        const data = (await res.json()) as Note;
        updateNote(id, { title: data.title, content: data.content, updatedAt: data.updatedAt });
        setNote((prev) => (prev ? { ...prev, ...data } : prev));
        setIsDirty(false);
        toast.success("已保存");
      } else {
        toast.error("保存失败，请重试");
      }
    } finally {
      setSaving(false);
    }
  }, [id, isDirty, title, content, updateNote, syncDraft, router]);

  // 取消：还原到上次已保存的状态
  const handleCancel = useCallback(() => {
    const serverNote = notes.find((n) => n.id === id) ?? note;
    if (serverNote && !serverNote.id.startsWith("local-")) {
      setTitle(serverNote.title);
      setContent(serverNote.content);
    } else {
      setTitle("");
      setContent("");
    }
    setIsDirty(false);
  }, [id, note, notes]);

  async function handleDelete() {
    if (!id || id.startsWith("local-")) {
      deleteNote(id);
      router.push("/");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      deleteNote(id);
      setDeleteDialogOpen(false);
      toast.success("笔记已删除");
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  const handleSelectionChange = useCallback(() => {
    const range = editorRef.current?.getSelectionRange() ?? null;
    if (range) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const domRange = selection.getRangeAt(0);
        const rect = domRange.getBoundingClientRect();
        if (rect.width > 0) {
          setSelectionAnchorRect(rect);
          setSelectionPopoverOpen(true);
          return;
        }
      }
    }
    setSelectionPopoverOpen(false);
    setSelectionAnchorRect(null);
  }, []);

  async function handleAiProcess(action: AiAction = "polish") {
    const range = editorRef.current?.getSelectionRange() ?? null;
    const contentToSend = range ? content.slice(range.start, range.end) : content;
    if (!contentToSend.trim()) return;
    try {
      const res = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSend, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? "AI 处理请求失败");
        return;
      }
      const body = res.body;
      if (!body) { toast.error("未返回流"); return; }
      setAiMeta({
        hadSelection: range !== null,
        selectionStart: range?.start ?? 0,
        selectionEnd: range?.end ?? content.length,
        contentAtClick: content,
      });
      setAiStream(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "请求失败");
    }
  }

  const handleAiAccept = useCallback(
    async (acceptedContent: string) => {
      if (!aiMeta) return;
      const newContent = aiMeta.hadSelection
        ? aiMeta.contentAtClick.slice(0, aiMeta.selectionStart) +
          acceptedContent +
          aiMeta.contentAtClick.slice(aiMeta.selectionEnd)
        : acceptedContent;
      setContent(newContent);
      setIsDirty(true);
      setAiStream(null);
      setAiMeta(null);
    },
    [aiMeta]
  );

  const handleAiDiscard = useCallback(() => {
    setAiStream(null);
    setAiMeta(null);
  }, []);

  if (!id) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-zinc-600 dark:text-zinc-400">无效的笔记地址</p>
          <Link href="/" className="mt-2 inline-block text-sm text-zinc-500 underline dark:text-zinc-500">
            返回列表
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-zinc-600 dark:text-zinc-400">加载中…</p>
        </div>
      </div>
    );
  }

  if (!note && !id.startsWith("local-")) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-zinc-600 dark:text-zinc-400">未找到笔记</p>
          <Link href="/" className="mt-2 inline-block text-sm text-zinc-500 underline dark:text-zinc-500">
            返回列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* 左侧：编辑区 */}
      <div className="flex flex-1 flex-col overflow-y-auto min-w-0">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-5 sm:py-8">
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              ← 返回列表
            </Link>
            <div className="flex items-center gap-2 flex-wrap">
              {isDirty && (
                <>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                </>
              )}
              {!isDirty && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {id.startsWith("local-") ? "草稿未保存" : "已保存"}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleAiProcess()}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
              >
                AI 处理
              </button>
              {/* Mobile-only Agent button */}
              <button
                type="button"
                onClick={() => setMobileAgentOpen(true)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 lg:hidden"
              >
                Agent
              </button>
              <button
                type="button"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleting}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-800/50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {deleting ? "删除中…" : "删除笔记"}
              </button>
            </div>
          </header>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除笔记</AlertDialogTitle>
                <AlertDialogDescription>
                  确定要删除这篇笔记吗？此操作不可恢复。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "删除中…" : "确定删除"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="无标题"
            className="mb-4 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xl font-medium text-foreground placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
          />

          <Tabs defaultValue="edit" className="w-full">
            <TabsList variant="line" className="mb-2">
              <TabsTrigger value="edit">编辑</TabsTrigger>
              <TabsTrigger value="preview">预览</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <div ref={editorWrapperRef}>
                <NoteEditor
                  ref={editorRef}
                  value={content}
                  onChange={handleContentChange}
                  onSelectionChange={handleSelectionChange}
                  placeholder="写点什么…"
                />
              </div>
            </TabsContent>
            <TabsContent value="preview">
              <MarkdownPreview content={content} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* 拖拽分隔条（仅大屏） */}
      <div
        className="hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors group select-none"
        onMouseDown={onDividerMouseDown}
        role="separator"
        aria-label="调整面板宽度"
      >
        <div className="h-10 w-0.5 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
      </div>

      {/* 右侧：Agent 对话面板（大屏显示，小屏隐藏） */}
      <div
        className="hidden border-l border-border lg:flex lg:flex-col shrink-0"
        style={{ width: panelWidth }}
      >
        <AgentChatPanel
          noteId={id.startsWith("local-") ? null : id}
          noteTitle={title}
          noteContent={content}
          onApplyToEditor={(agentContent) => {
            setContent((prev) => prev + "\n\n" + agentContent);
            setIsDirty(true);
          }}
        />
      </div>

      <SelectionAiPopover
        open={selectionPopoverOpen}
        onOpenChange={setSelectionPopoverOpen}
        anchorRect={selectionAnchorRect}
        onAction={(action) => handleAiProcess(action)}
      />
      <AiResultModal
        stream={aiStream}
        onAccept={handleAiAccept}
        onDiscard={handleAiDiscard}
      />

      {/* Mobile full-screen Agent modal */}
      <AgentMobileModal
        open={mobileAgentOpen}
        onClose={() => setMobileAgentOpen(false)}
        noteId={id.startsWith("local-") ? null : id}
        noteTitle={title}
        noteContent={content}
        onApplyToEditor={(agentContent) => {
          setContent((prev) => prev + "\n\n" + agentContent);
          setIsDirty(true);
        }}
      />
    </div>
  );
}
