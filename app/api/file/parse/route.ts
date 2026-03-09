import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

// Force this route to run in the Node.js runtime (not edge),
// so Buffer and Node-only libraries are available if needed.
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CHARS = 20000;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(arrayBuffer);
  const filename = (file as File).name;
  const ext = filename.split(".").pop()?.toLowerCase();

  let text = "";

  try {
    if (ext === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === "txt" || ext === "md") {
      text = buffer.toString("utf-8");
    } else {
      // For now we do not support PDF or other binary formats here to avoid
      // heavy browser polyfills (DOMMatrix, Path2D, etc). The Agent tools
      // can handle non-text inputs in a more controlled environment.
      return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
    }
  } catch (err) {
    console.error("[file/parse] error:", err);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + "\n\n[内容已截断，仅显示前 20000 字]";
  }

  return NextResponse.json({ text, filename });
}
