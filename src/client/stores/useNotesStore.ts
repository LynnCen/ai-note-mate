import { create } from "zustand";
import type { Note } from "@/types/note";

interface NotesState {
  notes: Note[];
  currentId: string | null;
}

interface NotesActions {
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Pick<Note, "title" | "content" | "updatedAt">>) => void;
  deleteNote: (id: string) => void;
  setCurrentId: (id: string | null) => void;
  fetchNotes: () => Promise<void>;
  /** Creates a local-only draft note (no API call). Returns the draft note. */
  createLocalDraft: () => Note;
  /** Persists a local draft to the API. Returns the saved note or null on error. */
  syncDraft: (draftId: string) => Promise<Note | null>;
}

type NotesStore = NotesState & NotesActions;

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],
  currentId: null,

  setNotes: (notes) => set({ notes }),

  addNote: (note) =>
    set((state) => ({ notes: [...state.notes, note] })),

  updateNote: (id, updates) =>
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    })),

  deleteNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      currentId: state.currentId === id ? null : state.currentId,
    })),

  setCurrentId: (id) => set({ currentId: id }),

  fetchNotes: async () => {
    const res = await fetch("/api/notes");
    const data = await res.json();
    set({ notes: res.ok ? data : [] });
  },

  createLocalDraft: () => {
    const now = new Date().toISOString();
    const draft: Note = {
      id: `local-${Date.now()}`,
      title: "",
      content: "",
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ notes: [...state.notes, draft] }));
    return draft;
  },

  syncDraft: async (draftId: string) => {
    const draft = get().notes.find((n) => n.id === draftId);
    if (!draft) return null;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, content: draft.content }),
      });
      if (!res.ok) return null;
      const saved = (await res.json()) as Note;
      set((state) => ({
        notes: state.notes.map((n) => (n.id === draftId ? saved : n)),
      }));
      return saved;
    } catch {
      return null;
    }
  },
}));
