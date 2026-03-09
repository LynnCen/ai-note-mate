/**
 * Notes repository: unified data access layer.
 * Automatically selects Firestore (if configured) or SQLite.
 * Server-side only.
 */
import { getFirestoreInstance } from "@server/firebase";
import * as sqliteNotes from "./sqlite";
import { makeRepository as makeFirestoreRepository } from "./firestore-adapter";
import type { Note } from "@/types/note";

export type NotesRepository = {
  getAll: () => Promise<Note[]>;
  getById: (id: string) => Promise<Note | null>;
  create: (note: { title?: string; content?: string }) => Promise<Note>;
  update: (id: string, updates: { title?: string; content?: string }) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
};

function makeSqliteRepository(): NotesRepository {
  return {
    getAll: sqliteNotes.getAll,
    getById: sqliteNotes.getById,
    create: sqliteNotes.create,
    update: sqliteNotes.update,
    deleteNote: sqliteNotes.deleteNote,
  };
}

let _repo: NotesRepository | null = null;

/**
 * Returns the notes repository: Firestore if configured, otherwise SQLite.
 * Use in API routes only (server-side).
 * On Vercel, Firestore must be configured; SQLite is not supported there.
 */
export function getNotesRepository(): NotesRepository {
  if (_repo) return _repo;
  const firestore = getFirestoreInstance();
  if (firestore) {
    _repo = makeFirestoreRepository();
    return _repo;
  }
  if (typeof process !== "undefined" && process.env.VERCEL) {
    throw new Error(
      "Notes backend not available on Vercel: set NEXT_PUBLIC_FIREBASE_* env vars to use Firestore. See docs/DEPLOY.md."
    );
  }
  _repo = makeSqliteRepository();
  return _repo;
}
