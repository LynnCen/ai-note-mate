"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, AlignLeft } from "lucide-react";
import { useNotesStore } from "@client/stores/useNotesStore";
import { OutlineNav } from "./OutlineNav";
import { useSidebarState } from "@client/hooks/useSidebarState";

const SIDEBAR_WIDTH_KEY = "note-sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

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

  // Resizable width
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(stored, 10))) : DEFAULT_WIDTH;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const filteredNotes = notes.filter((n) =>
    n.title.toLowerCase().includes(search.toLowerCase())
  );

  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center gap-4 border-r border-border bg-muted/20 pt-5">
        <button
          type="button"
          onClick={toggle}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="展开侧边栏"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center gap-3 mt-1">
          <FileText className="h-4 w-4 text-muted-foreground/50" />
          <AlignLeft className="h-4 w-4 text-muted-foreground/50" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0" style={{ width }}>
      {/* Main sidebar content */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border bg-muted/10 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-3 shrink-0">
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => setTab("notes")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                tab === "notes"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              笔记
            </button>
            <button
              type="button"
              onClick={() => setTab("outline")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                tab === "outline"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <AlignLeft className="h-3.5 w-3.5" />
              大纲
            </button>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="折叠侧边栏"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "notes" ? (
            <div className="p-2 space-y-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索笔记…"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <nav className="space-y-0.5">
                {filteredNotes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/note/${note.id}`}
                    className={`flex items-center gap-2 truncate rounded-md px-2.5 py-2 text-sm transition-colors ${
                      note.id === currentNoteId
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                    title={note.title || "无标题"}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="truncate">{note.title || "无标题"}</span>
                  </Link>
                ))}
                {filteredNotes.length === 0 && (
                  <p className="px-2.5 py-4 text-xs text-muted-foreground text-center">
                    {search ? "没有匹配的笔记" : "暂无笔记"}
                  </p>
                )}
              </nav>
            </div>
          ) : (
            <OutlineNav content={noteContent} onHeadingClick={onHeadingClick} />
          )}
        </div>
      </div>

      {/* Resize handle on right edge */}
      <div
        onMouseDown={onDragStart}
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
        title="拖拽调整宽度"
      />
    </div>
  );
}
