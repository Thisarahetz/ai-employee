"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  useDeleteSavedAnswer,
  useReplySettings,
  useReplyStats,
  useSavedAnswers,
  useTestSavedAnswer,
  useUpdateSavedAnswer,
} from "@/lib/hooks/use-saved-answers";
import { cn, getErrorMessage } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { SavedAnswer, SavedAnswerStatus } from "@/lib/types";
import { MODE_LABELS } from "@/lib/reply-modes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SavedAnswerFormModal } from "@/components/saved-answers/saved-answer-form-modal";

const TABS: { status: SavedAnswerStatus; label: string }[] = [
  { status: "ACTIVE", label: "Answers" },
  { status: "SUGGESTED", label: "Questions to answer" },
  { status: "DISABLED", label: "Turned off" },
];

const LANGS: { key: "answerEn" | "answerSi" | "answerSiLatn"; label: string }[] = [
  { key: "answerEn", label: "English" },
  { key: "answerSi", label: "Sinhala" },
  { key: "answerSiLatn", label: "Singlish" },
];

export default function SavedAnswersPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<SavedAnswerStatus>("ACTIVE");
  const [editing, setEditing] = useState<SavedAnswer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const list = useSavedAnswers(tab);
  const suggestions = useSavedAnswers("SUGGESTED");
  const stats = useReplyStats(30);
  const settings = useReplySettings();
  const update = useUpdateSavedAnswer();
  const remove = useDeleteSavedAnswer();

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(a: SavedAnswer) {
    setEditing(a);
    setFormOpen(true);
  }

  async function run(action: () => Promise<unknown>, fallback: string) {
    setRowError(null);
    try {
      await action();
      setConfirmingId(null);
    } catch (err) {
      setRowError(getErrorMessage(err, t(fallback)));
    }
  }

  const answers = list.data ?? [];
  const suggestionCount = suggestions.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-xl font-semibold text-ink-primary">{t("Saved Answers")}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {t(
              "Answers you write once and customers get instantly, in English, Sinhala or Singlish. They cost nothing and keep working even when AI is off or out of budget.",
            )}
          </p>
        </div>
        <Button onClick={openNew}>+ {t("Add saved answer")}</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-secondary">{t("Reply mode")}</p>
          <p className="mt-1 text-sm font-semibold text-ink-primary">
            {settings.data ? t(MODE_LABELS[settings.data.effectiveMode]) : "—"}
          </p>
          {settings.data && settings.data.mode !== settings.data.effectiveMode && (
            <p className="mt-1 text-xs text-amber-700">{t("Your plan doesn't include the mode you picked.")}</p>
          )}
          <Link href="/settings#reply-mode" className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">
            {t("Change in Settings")} →
          </Link>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-secondary">{t("Answered without AI (last 30 days)")}</p>
          <p className="mt-1 text-2xl font-bold text-ink-primary" data-testid="without-ai-percent">
            {stats.data ? `${stats.data.withoutAiPercent}%` : "—"}
          </p>
          <p className="text-xs text-ink-secondary">
            {stats.data
              ? `${stats.data.answeredWithoutAi} ${t("of")} ${stats.data.totalReplies} ${t("replies")}` +
                (stats.data.estimatedSavedUsd !== null ? ` · ${t("about")} $${stats.data.estimatedSavedUsd.toFixed(2)} ${t("saved")}` : "")
              : ""}
          </p>
        </Card>
        <TryQuestionCard />
      </div>

      <div role="tablist" aria-label={t("Saved answer lists")} className="flex gap-1 border-b border-line">
        {TABS.map((tb) => (
          <button
            key={tb.status}
            role="tab"
            type="button"
            aria-selected={tab === tb.status}
            onClick={() => {
              setTab(tb.status);
              setConfirmingId(null);
            }}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === tb.status ? "border-brand-600 text-brand-700" : "border-transparent text-ink-secondary hover:text-ink-primary",
            )}
          >
            {t(tb.label)}
            {tb.status === "SUGGESTED" && suggestionCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-700 px-1.5 py-0.5 text-[10px] font-bold text-white">{suggestionCount}</span>
            )}
          </button>
        ))}
      </div>

      {rowError && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {rowError}
        </p>
      )}

      {list.isLoading ? (
        <p className="text-sm text-ink-secondary">{t("Loading…")}</p>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, t("Could not load saved answers."))} onRetry={() => list.refetch()} />
      ) : answers.length === 0 ? (
        <EmptyState
          title={
            tab === "ACTIVE" ? "No saved answers yet" : tab === "SUGGESTED" ? "No unanswered questions" : "Nothing turned off"
          }
          description={
            tab === "ACTIVE"
              ? "Start with the questions customers ask most: opening hours, prices, location, parking."
              : tab === "SUGGESTED"
                ? "Questions that nothing could answer show up here, most-asked first, so you can answer them once."
                : undefined
          }
          action={tab === "ACTIVE" ? <Button onClick={openNew}>+ {t("Add saved answer")}</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {answers.map((a) => (
            <li key={a.id}>
              <Card className="p-4" data-testid="saved-answer">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-primary">{a.questions[0]}</p>
                    {a.questions.length > 1 && (
                      <p className="mt-0.5 text-xs text-ink-secondary">
                        {t("Also matches")}: {a.questions.slice(1, 4).join(" · ")}
                        {a.questions.length > 4 ? ` · +${a.questions.length - 4}` : ""}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-ink-secondary">
                    {a.status === "SUGGESTED"
                      ? `${t("Asked")} ${a.askedCount}× `
                      : `${t("Used")} ${a.useCount}×`}
                  </span>
                </div>

                {a.status !== "SUGGESTED" && (
                  <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                    {LANGS.map((l) => (
                      <div key={l.key} className="rounded-md bg-surface-page px-3 py-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{t(l.label)}</dt>
                        <dd className={cn("mt-0.5 text-sm", a[l.key] ? "text-ink-primary" : "italic text-ink-secondary")}>
                          {a[l.key] || t("Not written — the closest other language is used")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {a.status === "SUGGESTED" ? (
                    <>
                      <Button size="sm" onClick={() => openEdit(a)}>
                        {t("Write answer")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => remove.mutateAsync(a.id), "Could not dismiss.")}>
                        {t("Dismiss")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(a)}>
                        {t("Edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          run(
                            () => update.mutateAsync({ id: a.id, status: a.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
                            "Could not update this answer.",
                          )
                        }
                      >
                        {a.status === "ACTIVE" ? t("Turn off") : t("Turn on")}
                      </Button>
                      {confirmingId === a.id ? (
                        <>
                          <Button size="sm" variant="danger" isLoading={remove.isPending} onClick={() => run(() => remove.mutateAsync(a.id), "Could not delete.")}>
                            {t("Confirm delete")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                            {t("Cancel")}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingId(a.id)}>
                          {t("Delete")}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <SavedAnswerFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} existing={editing} />
    </div>
  );
}

/** Type a customer question and see exactly what they would get back. */
function TryQuestionCard() {
  const { t } = useI18n();
  const test = useTestSavedAnswer();
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState("en");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (message.trim()) test.mutate({ message, language });
  }

  const r = test.data;
  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-2">
        <Input label={t("Try a customer question")} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="kiyatada open karanne?" />
        <div className="flex gap-2">
          <Select aria-label={t("Customer language")} value={language} onChange={(e) => setLanguage(e.target.value)} className="py-1.5">
            <option value="en">English</option>
            <option value="si">සිංහල</option>
            <option value="si-Latn">Singlish</option>
          </Select>
          <Button type="submit" size="sm" isLoading={test.isPending}>
            {t("Try")}
          </Button>
        </div>
      </form>
      {r && (
        <div className="mt-3 rounded-md bg-surface-page px-3 py-2 text-sm" role="status" data-testid="try-result">
          {!r.matched ? (
            <p className="text-ink-secondary">{t("No saved answer fits. In Hybrid the AI answers; in No-AI a team member does.")}</p>
          ) : r.wouldReply ? (
            <>
              <p className="text-xs font-semibold text-emerald-700">{t("Customer gets this saved answer")}</p>
              <p className="mt-1 text-ink-primary">{r.reply}</p>
              {r.replyLanguageMissing && <p className="mt-1 text-xs text-amber-700">{t("Not written in this language yet.")}</p>}
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink-secondary">{t("Close, but not sure enough to send on its own")}</p>
              <p className="mt-1 text-ink-secondary">
                “{r.matchedQuestion}” — {t("add this wording as another way of asking to make it match.")}
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
