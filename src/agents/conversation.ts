import type { ChatMessage } from "@server/llm/types";
import type { AgentContext } from "@agents/types";
import { DOCUMENT_AGENT_SYSTEM, DRAFT_TEMPLATES } from "./document-agent/prompts";
import { readCurrentNote, searchNotes, draftDocument } from "./document-agent/tools";
import type { Note } from "@/types/note";

export interface ConversationRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: AgentContext;
  allNotes: Note[];
}

/**
 * 构造发给 LLM 的完整消息列表，自动注入：
 * - 系统提示（Agent 能力说明）
 * - 当前笔记内容（始终注入）
 * - 跨笔记搜索结果（触发词命中时注入）
 * - 文档草稿模板（起草触发词命中时注入）
 */
export function buildAgentMessages(req: ConversationRequest): ChatMessage[] {
  const { messages, context, allNotes } = req;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.content?.toLowerCase() ?? "";

  const toolContextParts: string[] = [];

  // 始终注入当前笔记内容
  if (context.noteContent !== null) {
    const result = readCurrentNote({
      title: context.noteTitle ?? "",
      content: context.noteContent,
    });
    toolContextParts.push(`[当前笔记]\n${result.content}`);
  }

  // 跨笔记搜索触发词
  const searchTriggers = [
    "搜索", "查找", "找一下", "其他笔记", "别的笔记",
    "search", "find", "other notes",
  ];
  if (searchTriggers.some((t) => userText.includes(t)) && lastUserMsg) {
    const result = searchNotes(lastUserMsg.content, allNotes);
    if (!result.error) {
      toolContextParts.push(`[搜索结果]\n${result.content}`);
    }
  }

  // 文档起草触发词
  const draftTriggers = [
    "起草", "草稿", "模板", "提纲", "大纲",
    "draft", "template", "outline",
  ];
  if (draftTriggers.some((t) => userText.includes(t)) && lastUserMsg) {
    const templateKey =
      userText.includes("会议") || userText.includes("meeting")
        ? "meeting"
        : userText.includes("周报") || userText.includes("weekly")
        ? "weekly"
        : "tech";
    const result = draftDocument(templateKey, context.noteTitle ?? "", DRAFT_TEMPLATES);
    toolContextParts.push(`[文档草稿]\n${result.content}`);
  }

  const systemContent = [
    DOCUMENT_AGENT_SYSTEM,
    ...(toolContextParts.length ? ["\n---\n" + toolContextParts.join("\n\n")] : []),
  ].join("\n");

  return [
    { role: "system", content: systemContent },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];
}
