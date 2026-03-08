import { NextResponse } from "next/server";
import { getFirestoreInstance } from "@/lib/firebase";
import * as notesFirestore from "@/lib/notes-firestore";

/**
 * GET /api/debug/firestore — diagnostic for Firestore connectivity.
 * Returns which layer fails (env → instance → Firestore). No secrets in response.
 */
export async function GET() {
  const envKeys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ] as const;
  const hasEnv = envKeys.every((k) => !!process.env[k]);
  const envPresent = Object.fromEntries(
    envKeys.map((k) => [k, !!process.env[k]])
  );

  const db = getFirestoreInstance();
  let getAllOk = false;
  let getAllError: string | null = null;
  if (db) {
    try {
      await notesFirestore.getAll();
      getAllOk = true;
    } catch (e) {
      getAllError = e instanceof Error ? e.message : String(e);
    }
  }

  const vercel = !!process.env.VERCEL;
  return NextResponse.json({
    layer1_env: {
      allSixSet: hasEnv,
      keys: envPresent,
    },
    layer2_getFirestoreInstance: db ? "ok" : "null",
    layer3_getAll: db === null ? "skipped" : getAllOk ? "ok" : getAllError,
    runtime: vercel ? "vercel" : "local",
  });
}
