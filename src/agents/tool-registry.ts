import { readCurrentNote, searchNotes, draftDocument } from "./document-agent/tools";
import { DRAFT_TEMPLATES } from "./document-agent/prompts";
import type { Note } from "@/types/note";

export interface AgentTool {
  name: string;
  description: string;
  parametersSchema: string; // JSON Schema string for LLM prompt
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "read_note",
    description: "读取当前打开的笔记的完整标题和正文内容。无需参数。",
    parametersSchema: "{}",
  },
  {
    name: "search_notes",
    description:
      "在用户所有笔记中关键词搜索，返回最相关的前 3 篇。参数：{ query: string }",
    parametersSchema: '{"query":"string"}',
  },
  {
    name: "draft_document",
    description:
      "根据模板生成文档草稿。参数：{ template: 'meeting'|'tech'|'weekly', title: string }",
    parametersSchema: '{"template":"meeting|tech|weekly","title":"string"}',
  },
];

type NoteContext = { title: string; content: string } | null;

/**
 * Execute a named tool and return the observation string.
 */
export async function executeAgentTool(
  toolName: string,
  toolInputJson: string,
  noteContext: NoteContext,
  allNotes: Note[]
): Promise<string> {
  let input: Record<string, string> = {};
  try {
    input = JSON.parse(toolInputJson);
  } catch {
    // ignore parse errors, treat as empty input
  }

  switch (toolName) {
    case "read_note": {
      const result = readCurrentNote(noteContext);
      return result.content;
    }
    case "search_notes": {
      const result = searchNotes(input.query ?? "", allNotes);
      return result.content;
    }
    case "draft_document": {
      const result = draftDocument(
        input.template ?? "tech",
        input.title ?? "",
        DRAFT_TEMPLATES
      );
      return result.content;
    }
    default:
      return `未知工具: ${toolName}`;
  }
}
