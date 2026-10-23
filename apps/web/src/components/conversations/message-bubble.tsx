"use client";

import type { Message } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const SENDER_LABEL: Record<Message["sender"], string> = {
  CUSTOMER: "Customer",
  AI: "AI",
  HUMAN_AGENT: "Human agent",
  SYSTEM: "System",
};

function renderFormattedContent(text: string) {
  return text.split("\n").map((line, lineIdx) => {
    const parts = line.split(/(\*\*.*?\*\*|__.*?__|`.*?`|\*[^\*\n]+?\*|_[^_\n]+?_)/g);
    return (
      <span key={lineIdx} className="block min-h-[1.25rem]">
        {parts.map((part, partIdx) => {
          if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
            return <strong key={partIdx} className="font-semibold">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={partIdx} className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>;
          }
          if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
            return <em key={partIdx} className="italic">{part.slice(1, -1)}</em>;
          }
          return part;
        })}
      </span>
    );
  });
}

export function MessageBubble({ message }: { message: Message }) {
  const { t } = useI18n();
  if (message.sender === "SYSTEM") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-surface-page px-3 py-1 text-xs italic text-ink-muted">{message.content}</span>
      </div>
    );
  }

  const isCustomer = message.sender === "CUSTOMER";
  const isHuman = message.sender === "HUMAN_AGENT";

  return (
    <div className={cn("flex flex-col gap-1", isCustomer ? "items-start" : "items-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm",
          isCustomer && "rounded-tl-sm border border-line bg-white text-ink-primary",
          message.sender === "AI" && "rounded-tr-sm bg-brand-600 text-white",
          isHuman && "rounded-tr-sm bg-[#4a3aa7] text-white",
        )}
      >
        <div className="whitespace-pre-wrap break-words">{renderFormattedContent(message.content)}</div>
      </div>
      <span className="px-1 text-[11px] text-ink-muted">
        {t(SENDER_LABEL[message.sender])} · {formatDateTime(message.createdAt)}
      </span>
    </div>
  );
}
