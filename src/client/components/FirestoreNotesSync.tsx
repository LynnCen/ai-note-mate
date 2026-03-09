"use client";

import { useEffect } from "react";
import { getFirestoreInstance } from "@server/firebase";
import { subscribeNotes } from "@server/notes/firestore-adapter";
import { useNotesStore } from "@client/stores/useNotesStore";

/**
 * Subscribes to Firestore notes when Firebase config is present. On each
 * snapshot, updates the Zustand store so list and detail stay in sync across
 * tabs/devices. No-op when Firebase is not configured (app continues to use
 * API/SQLite only).
 */
export function FirestoreNotesSync() {
  const setNotes = useNotesStore((s) => s.setNotes);

  useEffect(() => {
    if (!getFirestoreInstance()) return;
    const unsubscribe = subscribeNotes((notes) => setNotes(notes));
    return () => unsubscribe();
  }, [setNotes]);

  return null;
}
