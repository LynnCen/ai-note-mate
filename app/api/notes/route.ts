import { NextRequest, NextResponse } from "next/server";
import * as notesDb from "@/lib/notes-db";

/**
 * GET /api/notes — list all notes (newest first).
 */
export async function GET() {
  try {
    const notes = await notesDb.getAll();
    return NextResponse.json(notes);
  } catch (error) {
    console.error("GET /api/notes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notes — create a note. Body: { title?, content? }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : "";
    const content = typeof body.content === "string" ? body.content : "";
    const note = await notesDb.create({ title, content });
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}
