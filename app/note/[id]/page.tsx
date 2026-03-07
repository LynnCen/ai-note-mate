"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useNotesStore } from "@/stores/useNotesStore";
import { NoteEditor } from "@/components/NoteEditor";
import type { Note } from "@/types/note";

const DEBOUNCE_MS = 500;

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";
  const { notes, updateNote, deleteNote, fetchNotes, addNote } = useNotesStore();

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve note: from store or fetch by id
  useEffect(() => {
    if (!id) {
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

  const saveTitle = useCallback(
    async (newTitle: string) => {
      if (!id || newTitle === note?.title) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/notes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        const data = res.ok ? await res.json() : null;
        if (data) updateNote(id, { title: data.title, updatedAt: data.updatedAt });
      } finally {
        setSaving(false);
      }
    },
    [id, note?.title, updateNote]
  );

  const saveContent = useCallback(
    async (newContent: string) => {
      if (!id || newContent === note?.content) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/notes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newContent }),
        });
        const data = res.ok ? await res.json() : null;
        if (data) updateNote(id, { content: data.content, updatedAt: data.updatedAt });
      } finally {
        setSaving(false);
      }
    },
    [id, note?.content, updateNote]
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setTitle(next);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => {
      titleDebounceRef.current = null;
      saveTitle(next);
    }, DEBOUNCE_MS);
  };

  const handleTitleBlur = () => {
    if (titleDebounceRef.current) {
      clearTimeout(titleDebounceRef.current);
      titleDebounceRef.current = null;
    }
    saveTitle(title);
  };

  useEffect(() => {
    return () => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    };
  }, []);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      deleteNote(id);
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

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

  if (!note) {
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-5 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            ← 返回列表
          </Link>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">保存中…</span>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-800/50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {deleting ? "删除中…" : "删除笔记"}
            </button>
          </div>
        </header>

        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          placeholder="无标题"
          className="mb-4 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xl font-medium text-foreground placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
        />

        <NoteEditor
          value={content}
          onChange={setContent}
          onSave={saveContent}
          placeholder="写点什么…"
        />
      </div>
    </div>
  );
}
