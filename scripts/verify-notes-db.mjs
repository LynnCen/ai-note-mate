/**
 * One-off script to verify SQLite DB and notes table creation.
 * Run from project root: node scripts/verify-notes-db.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "notes.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
db.close();
console.log("Table created. Tables:", tables.map((t) => t.name));
