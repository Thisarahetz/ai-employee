"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Info, MessageSquarePlus, SendHorizontal, Trash2 } from "lucide-react";

import {
  isTaskActive,
  useCommandThread,
  useCommandThreads,
  useDeleteThread,
  usePendingApprovals,
  useSendCommand,
  useWorkforceTasks,
} from "@/lib/hooks/use-ai-workforce";
import { useAiEmployees } from "@/lib/hooks/use-ai-employees";
import type { AiTask, OwnerCommandMessage, OwnerCommandThread } from "@/lib/types";
import { cn, formatDateTime, getErrorMessage } from "@/lib/utils";
import { ReportText } from "@/components/ai-workforce/report-text";
import { TaskChip } from "@/components/ai-workforce/task-chip";
import { InlineApproval } from "@/components/ai-workforce/inline-approval";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";

const SUGGESTIONS = [
  "What is everyone working on?",
  "Give me a summary of what the team did today",
  "Ask marketing to analyse our website and suggest ways to get more bookings",
  "Team status report",
];

const LIMITATION_TEXT: Record<string, string> = {
  no_calendar: "No calendar is connected, so meetings can't be booked automatically.",
  no_employees: "You haven't hired any AI employees yet.",
  no_assignee: "No active AI employee could take this request.",
};

export default function CommandCenterPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <CommandCenter />
    </Suspense>
  );
}

function CommandCenter() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("thread");

  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const threads = useCommandThreads();
  const send = useSendCommand();
  const deleteThread = useDeleteThread();
  const employees = useAiEmployees();

  // Poll only while something in this conversation is still in progress.
  const [poll, setPoll] = useState(false);
  const approvals = usePendingApprovals(poll);
  const thread = useCommandThread(threadId, poll);
  const tasks = useWorkforceTasks(poll);

  const messages = useMemo(() => thread.data?.messages ?? [], [thread.data]);
  const taskById = useMemo(() => new Map((tasks.data ?? []).map((t) => [t.id, t])), [tasks.data]);
  const threadTaskIds = useMemo(() => new Set(messages.flatMap((m) => m.metadata?.taskIds ?? [])), [messages]);
  const employeeName = useMemo(
    () => new Map((employees.data ?? []).map((e) => [e.id, e.name])),
    [employees.data],
  );
  const threadApprovals = useMemo(
    () => (approvals.data ?? []).filter((a) => a.taskId && threadTaskIds.has(a.taskId)),
    [approvals.data, threadTaskIds],
  );

  useEffect(() => {
    const active = [...threadTaskIds].some((id) => {
      const t = taskById.get(id);
      return t ? isTaskActive(t.status) : false;
    });
    setPoll(active);
  }, [threadTaskIds, taskById]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingText, threadApprovals.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  const openThread = (id: string | null) => {
    router.replace(id ? `/command-center?thread=${id}` : "/command-center");
  };

  const submit = async (text: string) => {
    const content = text.trim();
    if (!content || send.isPending) return;
    setDraft("");
    setPendingText(content);
    try {
      const res = await send.mutateAsync({ text: content, threadId });
      if (res.threadId !== threadId) {
        // Show the new conversation immediately; the real fetch replaces this.
        const now = new Date().toISOString();
        queryClient.setQueryData<OwnerCommandThread>(["ai-workforce", "threads", res.threadId], (old) =>
          old ?? { id: res.threadId, title: content.slice(0, 120), createdAt: now, updatedAt: now, messages: res.messages },
        );
        openThread(res.threadId);
      }
    } catch {
      setDraft(content); // Give the text back so nothing is lost.
    } finally {
      setPendingText(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(draft);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this conversation? Tasks it created keep running.")) return;
    await deleteThread.mutateAsync(id);
    if (id === threadId) openThread(null);
  };

  const showEmpty = !threadId && !pendingText;

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-h-0 sm:-m-6 sm:h-[calc(100%+3rem)]">
      {/* Conversations */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={() => openThread(null)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink-primary transition-colors hover:bg-surface-page"
          >
            <MessageSquarePlus className="h-4 w-4" /> New conversation
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {threads.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
          {threads.data?.length === 0 && <p className="px-2 py-4 text-xs text-ink-muted">No conversations yet.</p>}
          {threads.data?.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-2 transition-colors",
                t.id === threadId ? "bg-brand-50" : "hover:bg-surface-page",
              )}
            >
              <button type="button" onClick={() => openThread(t.id)} className="min-w-0 flex-1 text-left">
                <p className={cn("truncate text-xs font-semibold", t.id === threadId ? "text-brand-700" : "text-ink-primary")}>
                  {t.title}
                </p>
                <p className="truncate text-[11px] text-ink-muted">{formatDateTime(t.updatedAt)}</p>
              </button>
              <button
                type="button"
                aria-label="Delete conversation"
                onClick={() => onDelete(t.id)}
                className="rounded p-1 text-ink-muted opacity-0 transition-opacity hover:text-status-critical focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <section className="flex min-w-0 flex-1 flex-col bg-surface-page">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-ink-primary">
              {thread.data?.title ?? "Command Center"}
            </h1>
            <p className="text-[11px] text-ink-muted">Give your AI team instructions. They report back here.</p>
          </div>
          <button
            type="button"
            onClick={() => openThread(null)}
            className="rounded-lg p-2 text-ink-secondary hover:bg-surface-page lg:hidden"
            aria-label="New conversation"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {showEmpty && <EmptyChat onPick={(s) => void submit(s)} disabled={send.isPending} />}

            {threadId && thread.isLoading && <FullPageSpinner />}
            {threadId && thread.isError && (
              <ErrorState message={getErrorMessage(thread.error, "Couldn't load this conversation.")} onRetry={() => thread.refetch()} />
            )}

            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} taskById={taskById} employeeName={employeeName} />
            ))}

            {pendingText && (
              <>
                <OwnerBubble text={pendingText} />
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <Spinner className="h-3.5 w-3.5" /> Working out who should handle this…
                </div>
              </>
            )}

            {threadApprovals.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Waiting for your approval</p>
                {threadApprovals.map((a) => <InlineApproval key={a.id} approval={a} />)}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="border-t border-line bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {send.isError && (
              <p className="mb-2 text-xs text-status-critical">{getErrorMessage(send.error, "Couldn't send that. Try again.")}</p>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-white px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={4000}
                placeholder="e.g. Ask sales to find new leads in Colombo by Friday"
                className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-ink-primary outline-none placeholder:text-ink-muted [field-sizing:content]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || send.isPending}
                aria-label="Send"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-muted">
              Enter to send · Shift+Enter for a new line · Emails and other sensitive actions always wait for your approval.
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}

function EmptyChat({ onPick, disabled }: { onPick: (s: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Bot className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-base font-bold text-ink-primary">What should your team work on?</h2>
      <p className="mt-1 max-w-md text-sm text-ink-secondary">
        Ask a question, give an instruction, or address someone directly (“Sales, …”). The right AI employee picks it up and
        reports back here.
      </p>
      <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-left text-xs text-ink-secondary transition-colors hover:border-brand-300 hover:text-ink-primary disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function OwnerBubble({ text, at }: { text: string; at?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2 text-sm text-white shadow-sm">
        {text}
      </div>
      {at && <span className="px-1 text-[11px] text-ink-muted">You · {formatDateTime(at)}</span>}
    </div>
  );
}

function ChatMessage({
  message,
  taskById,
  employeeName,
}: {
  message: OwnerCommandMessage;
  taskById: Map<string, AiTask>;
  employeeName: Map<string, string>;
}) {
  if (message.role === "OWNER") return <OwnerBubble text={message.content} at={message.createdAt} />;

  if (message.role === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-white px-3 py-1 text-xs italic text-ink-muted">{message.content}</span>
      </div>
    );
  }

  const linked = (message.metadata?.taskIds ?? []).map((id) => taskById.get(id)).filter((t): t is AiTask => Boolean(t));
  // Only the reply that created the work shows live task cards; reports already contain the outcome.
  const showTasks = !message.metadata?.kind && linked.length > 0;
  const limitations = (message.metadata?.limitations ?? []).map((l) => LIMITATION_TEXT[l]).filter(Boolean);
  const author = message.employeeId ? employeeName.get(message.employeeId) ?? "AI employee" : "AI Team";

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-line">
        <Bot className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-3 text-ink-primary shadow-sm">
          <ReportText text={message.content} />
          {showTasks && (
            <div className="mt-3 flex flex-col gap-2">
              {linked.map((t) => <TaskChip key={t.id} task={t} />)}
            </div>
          )}
          {limitations.length > 0 && (
            <div className="mt-3 flex gap-2 rounded-lg bg-surface-page px-3 py-2 text-xs text-ink-secondary">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{limitations.join(" ")}</span>
            </div>
          )}
        </div>
        <span className="px-1 text-[11px] text-ink-muted">
          {author} · {formatDateTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
