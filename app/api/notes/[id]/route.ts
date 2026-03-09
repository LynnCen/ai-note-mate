import { NextRequest, NextResponse } from "next/server";
import { getNotesRepository } from "@server/notes/repository";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/notes/[id] — fetch a single note by id.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const note = await getNotesRepository().getById(id);
    if (note === null) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json(note);
  } catch (error) {
    console.error("GET /api/notes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch note" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notes/[id] — update a note. Body: { title?, content? }.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const updates: { title?: string; content?: string } = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.content === "string") updates.content = body.content;
    const note = await getNotesRepository().update(id, updates);
    if (note === null) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json(note);
  } catch (error) {
    console.error("PUT /api/notes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notes/[id] — delete a note.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const deleted = await getNotesRepository().deleteNote(id);
    if (!deleted) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/notes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
