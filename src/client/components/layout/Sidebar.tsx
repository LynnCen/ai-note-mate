"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { OutlineNav } from "./OutlineNav";
import { useSidebarState } from "@client/hooks/useSidebarState";

interface SidebarProps {
  currentNoteId: string;
  noteContent: string;
  onHeadingClick?: (id: string) => void;
}

export function Sidebar({ currentNoteId, noteContent, onHeadingClick }: SidebarProps) {
  const { collapsed, toggle } = useSidebarState();
  const { notes } = useNotesStore();
  const [tab, setTab] = useState<"notes" | "outline">("notes");
  const [search, setSearch] = useState("");

  const filteredNotes = notes.filter((n) =>
    n.title.toLowerCase().includes(search.toLowerCase())
  );

  if (collapsed) {
    return (
      <div className="flex w-8 shrink-0 flex-col items-center border-r border-border bg-muted/30 pt-4">
        <button
          type="button"
          onClick={toggle}
          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="展开侧边栏"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/10">
      {/* Header with tabs + collapse button */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("notes")}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              tab === "notes"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            笔记
          </button>
          <button
            type="button"
            onClick={() => setTab("outline")}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              tab === "outline"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            大纲
          </button>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="折叠侧边栏"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "notes" ? (
          <div>
            <div className="px-2 pt-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索笔记…"
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <nav className="mt-1 space-y-0.5 px-1 py-1">
              {filteredNotes.map((note) => (
                <Link
                  key={note.id}
                  href={`/note/${note.id}`}
                  className={`block truncate rounded px-2 py-1.5 text-xs transition-colors ${
                    note.id === currentNoteId
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title={note.title || "无标题"}
                >
                  {note.title || "无标题"}
                </Link>
              ))}
              {filteredNotes.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">暂无笔记</p>
              )}
            </nav>
          </div>
        ) : (
          <OutlineNav content={noteContent} onHeadingClick={onHeadingClick} />
        )}
      </div>
    </div>
  );
}
