import { getDb } from "./db";
import type { Note } from "@/types/note";

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

/**
 * Fetch all notes, newest first.
 */
export function getAll(): Promise<Note[]> {
  const database = getDb();
  const rows = database.prepare("SELECT * FROM notes ORDER BY updatedAt DESC").all();
  return Promise.resolve((rows as Record<string, unknown>[]).map(rowToNote));
}

/**
 * Fetch a single note by id.
 */
export function getById(id: string): Promise<Note | null> {
  const database = getDb();
  const row = database.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return Promise.resolve(row ? rowToNote(row) : null);
}

/**
 * Create a note. id, createdAt, and updatedAt are set automatically.
 */
export function create(
  note: Omit<Note, "id" | "createdAt" | "updatedAt"> | Partial<Omit<Note, "id" | "createdAt" | "updatedAt">>
): Promise<Note> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = note.title ?? "";
  const content = note.content ?? "";
  const database = getDb();
  database
    .prepare("INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
    .run(id, title, content, now, now);
  return getById(id).then((n) => n!);
}

/**
 * Update a note by id. Only provided fields are updated; updatedAt is set automatically.
 */
export function update(
  id: string,
  updates: Partial<Omit<Note, "id" | "createdAt">>
): Promise<Note | null> {
  const database = getDb();
  const existing = database.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return Promise.resolve(null);
  const updatedAt = new Date().toISOString();
  const title = updates.title ?? String(existing.title);
  const content = updates.content ?? String(existing.content);
  database.prepare("UPDATE notes SET title = ?, content = ?, updatedAt = ? WHERE id = ?").run(title, content, updatedAt, id);
  return getById(id);
}

/**
 * Delete a note by id. Returns true if a row was deleted.
 */
export function deleteNote(id: string): Promise<boolean> {
  const database = getDb();
  const result = database.prepare("DELETE FROM notes WHERE id = ?").run(id);
  return Promise.resolve(result.changes > 0);
}
