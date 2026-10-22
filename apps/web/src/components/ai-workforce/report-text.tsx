import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the small markdown subset AI reports use: headings, bullet lists,
 * bold/italic/code, and horizontal rules. Content is rendered as React text
 * (never raw HTML), so model output can't inject markup.
 */
function inline(text: string): ReactNode[] {
  // `_x_` is italic only as a whole word, so names like GEMINI_API_KEY stay intact.
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<![\p{L}\p{N}])_[^_\s][^_]*_(?![\p{L}\p{N}]))/gu).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i} className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[12px]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={i} className="italic text-ink-secondary">{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function ReportText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {list.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/) ?? line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (/^-{3,}$/.test(line.trim())) {
      blocks.push(<hr key={blocks.length} className="my-3 border-line" />);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={blocks.length} className={cn("mt-3 font-semibold text-ink-primary first:mt-0", heading[1].length <= 2 ? "text-[15px]" : "text-sm")}>
          {inline(heading[2])}
        </p>,
      );
      continue;
    }
    blocks.push(<p key={blocks.length} className="my-1 first:mt-0">{inline(line)}</p>);
  }
  flushList();

  return <div className={cn("break-words text-sm leading-relaxed", className)}>{blocks}</div>;
}
