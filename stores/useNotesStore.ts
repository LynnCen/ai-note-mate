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
}

type NotesStore = NotesState & NotesActions;

const initialState: NotesState = {
  notes: [],
  currentId: null,
};

export const useNotesStore = create<NotesStore>((set) => ({
  ...initialState,

  setNotes: (notes) => set({ notes }),

  addNote: (note) =>
    set((state) => ({
      notes: [...state.notes, note],
    })),

  updateNote: (id, updates) =>
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
    })),

  deleteNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      currentId: state.currentId === id ? null : state.currentId,
    })),

  setCurrentId: (id) => set({ currentId: id }),
}));
