import type { Note } from "@/types/note";

export type ToolResult = { content: string; error?: string };

/**
 * 返回当前打开笔记的完整内容，供 Agent 引用。
 */
export function readCurrentNote(note: { title: string; content: string } | null): ToolResult {
  if (!note) return { content: "当前没有打开的笔记。", error: "no_note" };
  return {
    content: `标题：${note.title || "（无标题）"}\n\n正文：\n${note.content || "（空白）"}`,
  };
}

/**
 * 对所有笔记做关键词匹配，返回得分最高的前 3 篇。
 * 生产环境可替换为向量相似度搜索。
 */
export function searchNotes(query: string, notes: Note[]): ToolResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = notes.map((n) => {
    const text = `${n.title} ${n.content}`.toLowerCase();
    const score = terms.reduce((acc, t) => {
      const matches = (text.match(new RegExp(t, "g")) ?? []).length;
      return acc + matches;
    }, 0);
    return { note: n, score };
  });

  const results = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!results.length) return { content: "未找到相关笔记。" };

  const formatted = results
    .map(
      (r) =>
        `### ${r.note.title || "（无标题）"}\n${r.note.content.slice(0, 300)}${
          r.note.content.length > 300 ? "…" : ""
        }`
    )
    .join("\n\n---\n\n");

  return { content: `找到 ${results.length} 篇相关笔记：\n\n${formatted}` };
}

/**
 * 根据模板 key 返回填好基础占位符的 Markdown 文档草稿。
 */
export function draftDocument(
  templateKey: string,
  title: string,
  templates: Record<string, string>
): ToolResult {
  const template = templates[templateKey] ?? templates["tech"];
  const date = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const filled = template
    .replace("{date}", date)
    .replace("{title}", title || "文档标题");
  return { content: filled };
}
