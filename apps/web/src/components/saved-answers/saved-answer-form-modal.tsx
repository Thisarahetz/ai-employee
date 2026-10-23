"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSavedAnswer, useUpdateSavedAnswer } from "@/lib/hooks/use-saved-answers";
import { getErrorMessage } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { SavedAnswer } from "@/lib/types";

export interface SavedAnswerDraft {
  questions?: string[];
  answerEn?: string;
  answerSi?: string;
  answerSiLatn?: string;
  sourceConversationId?: string;
}

/**
 * Add or edit a saved answer. `existing` edits it (a SUGGESTED one is turned
 * into an active answer on save); `draft` pre-fills a new one, e.g. from a
 * conversation.
 */
export function SavedAnswerFormModal({
  isOpen,
  onClose,
  existing,
  draft,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  existing?: SavedAnswer | null;
  draft?: SavedAnswerDraft | null;
  onSaved?: (answer: SavedAnswer) => void;
}) {
  const { t } = useI18n();
  const create = useCreateSavedAnswer();
  const update = useUpdateSavedAnswer();
  const [questions, setQuestions] = useState("");
  const [answerEn, setAnswerEn] = useState("");
  const [answerSi, setAnswerSi] = useState("");
  const [answerSiLatn, setAnswerSiLatn] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const src = existing ?? draft ?? {};
    setQuestions((src.questions ?? []).join("\n"));
    setAnswerEn(src.answerEn ?? "");
    setAnswerSi(src.answerSi ?? "");
    setAnswerSiLatn(src.answerSiLatn ?? "");
    setError(null);
    // Keyed on the id so a background refresh of the list doesn't wipe what the owner is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, existing?.id, draft]);

  const isSuggestion = existing?.status === "SUGGESTED";
  const isPending = create.isPending || update.isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const list = questions
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);
    if (!list.length) {
      setError(t("Add at least one way customers ask this question."));
      return;
    }
    if (!answerEn.trim() && !answerSi.trim() && !answerSiLatn.trim()) {
      setError(t("Write the answer in at least one language."));
      return;
    }
    const input = { questions: list, answerEn, answerSi, answerSiLatn };
    try {
      const saved = existing
        ? await update.mutateAsync({ id: existing.id, ...input, ...(isSuggestion ? { status: "ACTIVE" as const } : {}) })
        : await create.mutateAsync({ ...input, sourceConversationId: draft?.sourceConversationId });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t("Could not save this answer.")));
    }
  }

  const title = existing ? (isSuggestion ? t("Answer this question") : t("Edit saved answer")) : t("Add saved answer");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={t("Customers who ask any of these questions get this answer straight away, without AI.")}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
            {error}
          </p>
        )}
        <Textarea
          label={t("Ways customers ask (one per line)")}
          hint={t("Add a few: English, Sinhala and Singlish. Spelling mistakes are matched automatically.")}
          rows={4}
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          placeholder={"What are your opening hours?\nවිවෘත වේලාවන් මොනවද?\nkiyatada open karanne"}
          autoFocus
        />
        <Textarea label={t("Answer in English")} rows={3} value={answerEn} onChange={(e) => setAnswerEn(e.target.value)} />
        <Textarea label={t("Answer in Sinhala")} rows={3} value={answerSi} onChange={(e) => setAnswerSi(e.target.value)} />
        <Textarea
          label={t("Answer in Singlish")}
          hint={t("Leave a language empty and the closest other language is used.")}
          rows={3}
          value={answerSiLatn}
          onChange={(e) => setAnswerSiLatn(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            {t("Cancel")}
          </Button>
          <Button type="submit" isLoading={isPending}>
            {existing && !isSuggestion ? t("Save changes") : t("Save answer")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
