import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreInstance } from "@server/firebase";
import type { Note } from "@/types/note";
import type { NotesRepository } from "./repository";

const COLLECTION_ID = "notes";

function docToNote(id: string, data: Record<string, unknown>): Note {
  return {
    id,
    title: String(data.title ?? ""),
    content: String(data.content ?? ""),
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

/**
 * Subscribe to the notes collection for real-time updates. Returns an unsubscribe function.
 * No-op if Firestore is not available.
 */
export function subscribeNotes(callback: (notes: Note[]) => void): () => void {
  const db = getFirestoreInstance();
  if (!db) {
    callback([]);
    return () => {};
  }
  const col = collection(db, COLLECTION_ID);
  const unsubscribe = onSnapshot(col, (snapshot) => {
    const notes = snapshot.docs
      .map((d) => docToNote(d.id, d.data()))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    callback(notes);
  });
  return unsubscribe;
}

export function makeRepository(): NotesRepository {
  return {
    getAll: async () => {
      const db = getFirestoreInstance();
      if (!db) return [];
      const col = collection(db, COLLECTION_ID);
      const snapshot = await getDocs(col);
      return snapshot.docs
        .map((d) => docToNote(d.id, d.data()))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    },

    getById: async (id) => {
      const db = getFirestoreInstance();
      if (!db) return null;
      const ref = doc(db, COLLECTION_ID, id);
      const snap = await getDoc(ref);
      return snap.exists() ? docToNote(snap.id, snap.data()) : null;
    },

    create: async (note) => {
      const db = getFirestoreInstance();
      if (!db) throw new Error("Firestore not available");
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const full: Note = {
        id,
        title: note.title ?? "",
        content: note.content ?? "",
        createdAt: now,
        updatedAt: now,
      };
      const ref = doc(db, COLLECTION_ID, id);
      await setDoc(ref, full);
      return full;
    },

    update: async (id, updates) => {
      const db = getFirestoreInstance();
      if (!db) throw new Error("Firestore not available");
      const ref = doc(db, COLLECTION_ID, id);
      const existing = await getDoc(ref);
      if (!existing.exists()) return null;
      const payload: Record<string, string> = { updatedAt: new Date().toISOString() };
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.content !== undefined) payload.content = updates.content;
      await updateDoc(ref, payload);
      const updated = await getDoc(ref);
      return updated.exists() ? docToNote(updated.id, updated.data()) : null;
    },

    deleteNote: async (id) => {
      const db = getFirestoreInstance();
      if (!db) throw new Error("Firestore not available");
      const ref = doc(db, COLLECTION_ID, id);
      await deleteDoc(ref);
      return true;
    },
  };
}
