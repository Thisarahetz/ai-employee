import type { Message } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const SENDER_LABEL: Record<Message["sender"], string> = {
  CUSTOMER: "Customer",
  AI: "AI",
  HUMAN_AGENT: "Human agent",
  SYSTEM: "System",
};

export function MessageBubble({ message }: { message: Message }) {
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
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      <span className="px-1 text-[11px] text-ink-muted">
        {SENDER_LABEL[message.sender]} · {formatDateTime(message.createdAt)}
      </span>
    </div>
  );
}
