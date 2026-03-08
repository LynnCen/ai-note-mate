"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotesStore } from "@/stores/useNotesStore";
import type { Note } from "@/types/note";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "";
  }
}

function summary(content: string, maxLen = 80): string {
  const line = content.split("\n")[0]?.trim() ?? "";
  if (line.length <= maxLen) return line || "无内容";
  return line.slice(0, maxLen) + "…";
}

export default function Home() {
  const router = useRouter();
  const { notes, fetchNotes, addNote } = useNotesStore();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  async function handleNewNote() {
    setCreating(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", content: "" }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) {
        console.error("Create note failed:", (data as { error?: string }).error ?? res.status);
        return;
      }
      const note = data as Note;
      addNote(note);
      router.push(`/note/${note.id}`);
    } catch (e) {
      console.error("Create note error:", e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-5 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            笔记
          </h1>
          <button
            type="button"
            onClick={handleNewNote}
            disabled={creating}
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50 sm:w-auto"
          >
            {creating ? "创建中…" : "新建笔记"}
          </button>
        </header>

        {notes.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            暂无笔记，点击「新建笔记」开始
          </p>
        ) : (
          <ul className="grid gap-2 sm:gap-3">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/note/${note.id}`}
                  className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                >
                  <h2 className="font-medium text-foreground line-clamp-1">
                    {note.title || "无标题"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 line-clamp-2 dark:text-zinc-400">
                    {summary(note.content)}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                    {formatDate(note.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
