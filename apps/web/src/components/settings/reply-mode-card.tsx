"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, MessageSquareReply } from "lucide-react";

import { useReplySettings, useSetReplyMode } from "@/lib/hooks/use-saved-answers";
import { MODE_DETAILS } from "@/lib/reply-modes";
import { cn, getErrorMessage } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { ReplyMode } from "@/lib/types";

const ORDER: ReplyMode[] = ["HYBRID", "NO_AI", "AI"];

/** Settings → how customer replies are written (AI / Hybrid / No AI), within the plan. */
export function ReplyModeCard() {
  const { t } = useI18n();
  const settings = useReplySettings();
  const setMode = useSetReplyMode();
  const [choice, setChoice] = useState<ReplyMode | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) setChoice(settings.data.mode);
  }, [settings.data]);

  const allowed = settings.data?.allowedModes ?? [];
  const changed = !!settings.data && choice !== settings.data.mode;

  async function save() {
    if (!choice) return;
    try {
      await setMode.mutateAsync(choice);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // Shown below from setMode.error.
    }
  }

  return (
    <section id="reply-mode" className="rounded-2xl border border-line bg-white p-6 shadow-xs space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareReply className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-primary">{t("Customer replies")}</h2>
      </div>
      <p className="text-xs text-ink-secondary">
        {t("Choose how replies to customers are written. Saved answers work in every mode.")}{" "}
        <Link href="/saved-answers" className="font-semibold text-brand-600 hover:underline">
          {t("Manage saved answers")} →
        </Link>
      </p>

      {settings.isLoading ? (
        <p className="text-xs text-ink-secondary">{t("Loading…")}</p>
      ) : settings.isError ? (
        <p className="text-xs text-status-critical">{getErrorMessage(settings.error, t("Could not load reply settings."))}</p>
      ) : (
        <div role="radiogroup" aria-label={t("Reply mode")} className="grid gap-3 md:grid-cols-3">
          {ORDER.map((mode) => {
            const inPlan = allowed.includes(mode);
            const selected = choice === mode;
            return (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer flex-col rounded-xl border p-4 text-xs transition-colors",
                  selected ? "border-brand-600 bg-brand-50" : "border-line hover:bg-surface-page",
                  !inPlan && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="reply-mode"
                    value={mode}
                    checked={selected}
                    disabled={!inPlan}
                    onChange={() => setChoice(mode)}
                    className="h-4 w-4 border-line text-brand-600 focus:ring-brand-500"
                  />
                  <span className="font-bold text-ink-primary">{t(MODE_DETAILS[mode].title)}</span>
                </span>
                <span className="mt-1.5 text-ink-secondary">{t(MODE_DETAILS[mode].description)}</span>
                {!inPlan && <span className="mt-2 font-semibold text-amber-700">{t("Not included in your plan")}</span>}
              </label>
            );
          })}
        </div>
      )}

      {settings.data && settings.data.mode !== settings.data.effectiveMode && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("Your plan doesn't include the mode you picked, so this mode is used:")} <strong>{t(MODE_DETAILS[settings.data.effectiveMode].title)}</strong>
        </p>
      )}
      {setMode.isError && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
          {getErrorMessage(setMode.error, t("Could not save your settings."))}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!changed || setMode.isPending}
        className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {saved ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-300" /> {t("Saved")}
          </>
        ) : setMode.isPending ? (
          t("Saving...")
        ) : (
          t("Save reply mode")
        )}
      </button>
    </section>
  );
}
