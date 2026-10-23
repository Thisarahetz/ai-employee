"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, ChevronRight, Circle, GraduationCap, X } from "lucide-react";

import {
  useGettingStarted,
  useSetGettingStartedDismissed,
  type GettingStarted,
  type GettingStartedStep,
} from "@/lib/hooks/use-business-setup";
import { cn } from "@/lib/utils";

function Progress({ data }: { data: GettingStarted }) {
  const pct = Math.round((data.requiredCompleted / Math.max(1, data.requiredTotal)) * 100);
  return (
    <div className="h-2 w-full rounded-full bg-surface-page" role="progressbar" aria-label="Setup progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StepRow({ step, isNext, onNavigate }: { step: GettingStartedStep; isNext: boolean; onNavigate?: () => void }) {
  return (
    <li className={cn("flex gap-3 rounded-lg p-3", isNext && "bg-brand-50 ring-1 ring-brand-200")}>
      {step.done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-semibold", step.done ? "text-ink-secondary line-through" : "text-ink-primary")}>{step.title}</span>
          {step.optional && <span className="rounded bg-surface-page px-1.5 py-0.5 text-[10px] text-ink-muted">optional</span>}
          {step.detail && <span className="text-xs text-ink-muted">· {step.detail}</span>}
        </div>
        {!step.done && <p className="mt-0.5 text-xs text-ink-secondary">{step.why}</p>}
        {!step.done && (
          <Link
            href={step.href}
            onClick={onNavigate}
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold",
              isNext ? "bg-brand-600 text-white hover:bg-brand-700" : "text-brand-700 hover:underline",
            )}
          >
            {isNext ? "Do this next: " : ""}
            {step.action} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Dashboard card that walks a new business through setup, one step at a time.
 * Every tick comes from real data, so a step can only be completed by doing it.
 */
export function GettingStartedCard({ welcome = false }: { welcome?: boolean }) {
  const q = useGettingStarted();
  const dismiss = useSetGettingStartedDismissed();
  const data = q.data;
  if (!data || data.dismissed || data.completed === data.total) return null;

  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink-primary">
              {welcome && !data.isComplete
                ? "Welcome! Let's get your business running"
                : data.isComplete
                  ? "Your business is set up"
                  : "Getting started"}
            </h2>
            <p className="text-xs text-ink-secondary">
              {data.isComplete
                ? "All essential steps are done. The optional ones below make your AI team even more useful."
                : `${data.requiredCompleted} of ${data.requiredTotal} essential steps done. Follow them in order; each one ticks itself off when it is really done.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          title="Hide this guide"
          aria-label="Hide this guide"
          onClick={() => dismiss.mutate(true)}
          className="rounded-md p-1 text-ink-muted hover:bg-surface-page hover:text-ink-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4">
        <Progress data={data} />
      </div>
      <ol className="mt-4 space-y-1">
        {data.steps.map((st) => (
          <StepRow key={st.key} step={st} isNext={data.next?.key === st.key} />
        ))}
      </ol>
    </section>
  );
}

/**
 * "Setup x/y" button in the corner of every page until the essential steps are
 * done; opens the checklist so the next step is always one click away.
 */
export function SetupProgressButton() {
  const q = useGettingStarted();
  const dismiss = useSetGettingStartedDismissed();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const data = q.data;
  if (!data || data.dismissed || data.isComplete || pathname === "/onboarding") return null;
  // Chat pages have a message box along the bottom; sit above it, not on it.
  const hasComposer = pathname === "/command-center" || /^\/conversations\/[^/]+$/.test(pathname ?? "");

  return (
    <div className={cn("fixed right-5 z-40 flex flex-col items-end", hasComposer ? "bottom-28" : "bottom-5")}>
      {open && (
        <div className="mb-3 max-h-[70vh] w-96 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-2xl border border-line bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-ink-primary">Getting started</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-ink-muted hover:bg-surface-page">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Progress data={data} />
          <ol className="mt-3 space-y-1">
            {data.steps.map((st) => (
              <StepRow key={st.key} step={st} isNext={data.next?.key === st.key} onNavigate={() => setOpen(false)} />
            ))}
          </ol>
          <button type="button" onClick={() => dismiss.mutate(true)} className="mt-3 text-xs text-ink-muted hover:underline">
            I&apos;ll finish later — hide the guide
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-brand-700"
      >
        <GraduationCap className="h-4 w-4" />
        Setup {data.requiredCompleted}/{data.requiredTotal}
        {data.next && !open && <span className="hidden font-normal opacity-90 sm:inline">· next: {data.next.title}</span>}
      </button>
    </div>
  );
}
