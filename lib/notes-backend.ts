import { getFirestoreInstance } from "./firebase";
import * as notesDb from "./notes-db";
import * as notesFirestore from "./notes-firestore";
import type { Note } from "@/types/note";

export type NotesBackend = {
  getAll: () => Promise<Note[]>;
  getById: (id: string) => Promise<Note | null>;
  create: (note: { title?: string; content?: string }) => Promise<Note>;
  update: (
    id: string,
    updates: { title?: string; content?: string }
  ) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
};

function firestoreBackend(): NotesBackend {
  return {
    getAll: notesFirestore.getAll,
    getById: notesFirestore.getById,
    create: (note) => notesFirestore.createNote(note).then((n) => n),
    update: async (id, updates) => {
      const existing = await notesFirestore.getById(id);
      if (!existing) return null;
      await notesFirestore.updateNote(id, updates);
      return notesFirestore.getById(id);
    },
    deleteNote: (id) => notesFirestore.deleteNote(id).then(() => true),
  };
}

function sqliteBackend(): NotesBackend {
  return {
    getAll: notesDb.getAll,
    getById: notesDb.getById,
    create: notesDb.create,
    update: notesDb.update,
    deleteNote: notesDb.deleteNote,
  };
}

let _backend: NotesBackend | null = null;

/**
 * Returns the notes backend: Firestore if configured, otherwise SQLite.
 * Use in API routes only (server-side).
 */
export function getNotesBackend(): NotesBackend {
  if (_backend) return _backend;
  _backend = getFirestoreInstance() ? firestoreBackend() : sqliteBackend();
  return _backend;
}
