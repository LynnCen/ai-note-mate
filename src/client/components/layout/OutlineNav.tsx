"use client";

interface Heading {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

interface OutlineNavProps {
  content: string;
  onHeadingClick?: (id: string) => void;
}

function parseHeadings(content: string): Heading[] {
  const lines = content.split("\n");
  const headings: Heading[] = [];
  let counter = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      headings.push({
        level: m[1].length as 1 | 2 | 3,
        text: m[2].trim(),
        id: `heading-${counter++}`,
      });
    }
  }
  return headings;
}

export function OutlineNav({ content, onHeadingClick }: OutlineNavProps) {
  const headings = parseHeadings(content);

  if (headings.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        暂无标题，在正文中添加 # 标题即可显示大纲。
      </p>
    );
  }

  return (
    <nav className="px-2 py-2 space-y-0.5">
      {headings.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => onHeadingClick?.(h.id)}
          className={`block w-full truncate rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted hover:text-foreground text-muted-foreground ${
            h.level === 1 ? "font-medium" : h.level === 2 ? "pl-4" : "pl-6 text-[11px]"
          }`}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}
