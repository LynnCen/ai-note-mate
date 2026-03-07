import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreInstance } from "./firebase";
import type { Note } from "@/types/note";

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
 * Subscribe to the notes collection for real-time updates. Callback receives
 * current list of notes (newest first by updatedAt). Returns an unsubscribe
 * function. No-op and returns a no-op function if Firestore is not available
 * (e.g. server or missing config).
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
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    callback(notes);
  });
  return unsubscribe;
}

/**
 * Create a note. id, createdAt, and updatedAt are set automatically if omitted.
 */
export function createNote(
  note: Omit<Note, "id" | "createdAt" | "updatedAt"> | Partial<Omit<Note, "id" | "createdAt" | "updatedAt">>
): Promise<Note> {
  const db = getFirestoreInstance();
  if (!db) return Promise.reject(new Error("Firestore not available"));
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
  return setDoc(ref, full).then(() => full);
}

/**
 * Update a note by id. Only provided fields are updated; updatedAt is set automatically.
 */
export function updateNote(
  id: string,
  updates: Partial<Pick<Note, "title" | "content">>
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return Promise.reject(new Error("Firestore not available"));
  const ref = doc(db, COLLECTION_ID, id);
  const payload: Record<string, string> = {
    updatedAt: new Date().toISOString(),
  };
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.content !== undefined) payload.content = updates.content;
  return updateDoc(ref, payload);
}

/**
 * Delete a note by id.
 */
export function deleteNote(id: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return Promise.reject(new Error("Firestore not available"));
  const ref = doc(db, COLLECTION_ID, id);
  return deleteDoc(ref);
}
