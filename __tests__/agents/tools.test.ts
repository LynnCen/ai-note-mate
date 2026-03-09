import { describe, it, expect } from "vitest";
import { readCurrentNote, searchNotes, draftDocument } from "@agents/document-agent/tools";
import { DRAFT_TEMPLATES } from "@agents/document-agent/prompts";
import type { Note } from "@/types/note";

function makeNote(id: string, title: string, content: string): Note {
  return {
    id,
    title,
    content,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("readCurrentNote", () => {
  it("返回笔记标题和正文", () => {
    const result = readCurrentNote({ title: "测试笔记", content: "你好世界" });
    expect(result.content).toContain("测试笔记");
    expect(result.content).toContain("你好世界");
    expect(result.error).toBeUndefined();
  });

  it("note 为 null 时返回 no_note 错误", () => {
    const result = readCurrentNote(null);
    expect(result.error).toBe("no_note");
  });

  it("标题为空时使用占位文本", () => {
    const result = readCurrentNote({ title: "", content: "内容" });
    expect(result.content).toContain("（无标题）");
  });
});

describe("searchNotes", () => {
  const notes = [
    makeNote("1", "React Hooks 详解", "useState useEffect 自定义 Hook 用法"),
    makeNote("2", "Vue 组合式 API", "ref reactive computed watchEffect"),
    makeNote("3", "TypeScript 入门", "类型 接口 泛型 枚举 装饰器"),
  ];

  it("根据关键词找到相关笔记", () => {
    const result = searchNotes("useState Hook", notes);
    expect(result.content).toContain("React Hooks");
    expect(result.error).toBeUndefined();
  });

  it("无匹配时返回无结果提示", () => {
    const result = searchNotes("Python Django Flask", notes);
    expect(result.content).toContain("未找到");
  });

  it("最多返回 3 篇结果", () => {
    const manyNotes = Array.from({ length: 10 }, (_, i) =>
      makeNote(String(i), `笔记 ${i}`, "共同关键词 内容 重复")
    );
    const result = searchNotes("关键词", manyNotes);
    const count = (result.content.match(/###/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(3);
  });

  it("超过 300 字的笔记内容会被截断", () => {
    const longNote = makeNote("x", "长文笔记", "A".repeat(400));
    const result = searchNotes("长文", [longNote]);
    expect(result.content).toContain("…");
  });
});

describe("draftDocument", () => {
  it("生成会议纪要模板", () => {
    const result = draftDocument("meeting", "周例会", DRAFT_TEMPLATES);
    expect(result.content).toContain("会议纪要");
    expect(result.content).toContain("参会人员");
    expect(result.content).toContain("待办事项");
  });

  it("生成技术文档模板并替换标题", () => {
    const result = draftDocument("tech", "系统设计文档", DRAFT_TEMPLATES);
    expect(result.content).toContain("系统设计文档");
    expect(result.content).toContain("概述");
  });

  it("生成周报模板", () => {
    const result = draftDocument("weekly", "", DRAFT_TEMPLATES);
    expect(result.content).toContain("周报");
    expect(result.content).toContain("本周完成");
  });

  it("未知模板 key 回退到 tech 模板", () => {
    const result = draftDocument("unknown_key", "我的文档", DRAFT_TEMPLATES);
    expect(result.content).toContain("我的文档");
    expect(result.content).toContain("概述");
  });

  it("自动填入今日日期", () => {
    const result = draftDocument("meeting", "", DRAFT_TEMPLATES);
    const year = new Date().getFullYear().toString();
    expect(result.content).toContain(year);
  });
});
