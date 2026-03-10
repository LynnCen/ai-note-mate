import { readCurrentNote, searchNotes, draftDocument } from "./document-agent/tools";
import { DRAFT_TEMPLATES } from "./document-agent/prompts";
import type { ToolDefinition } from "@server/llm/types";
import type { Note } from "@/types/note";

export type { ToolDefinition };

/** Tools available to the Document Agent — OpenAI function calling format */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_note",
      description:
        "读取当前打开的笔记的完整标题和正文内容。写文档或回答与当前笔记强相关的问题时，优先调用本工具。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description:
        "在用户所有笔记中进行关键词搜索，返回最相关的前 3 篇，用于补充当前笔记之外的上下文信息。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_document",
      description:
        "根据指定模板生成 Markdown 文档骨架（会议纪要 / 技术文档 / 周报）。仅在用户明确要求“给我一个模板/骨架，我自己填”时调用，不要在普通写文档场景下默认使用。",
      parameters: {
        type: "object",
        properties: {
          template: {
            type: "string",
            enum: ["meeting", "tech", "weekly"],
            description: "模板类型",
          },
          title: {
            type: "string",
            description: "文档标题",
          },
        },
        required: ["template", "title"],
      },
    },
  },
];

type NoteContext = { title: string; content: string } | null;

/**
 * Execute a named tool and return the observation string.
 */
export async function executeAgentTool(
  toolName: string,
  toolArgsJson: string,
  noteContext: NoteContext,
  allNotes: Note[]
): Promise<string> {
  let args: Record<string, string> = {};
  try {
    args = JSON.parse(toolArgsJson) as Record<string, string>;
  } catch {
    // treat as empty args
  }

  switch (toolName) {
    case "read_note": {
      const result = readCurrentNote(noteContext);
      return result.content;
    }
    case "search_notes": {
      const result = searchNotes(args.query ?? "", allNotes);
      return result.content;
    }
    case "draft_document": {
      const result = draftDocument(
        args.template ?? "tech",
        args.title ?? "",
        DRAFT_TEMPLATES
      );
      return result.content;
    }
    default:
      return `未知工具: ${toolName}`;
  }
}
