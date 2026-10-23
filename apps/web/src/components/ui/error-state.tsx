"use client";

import { useI18n } from "@/lib/i18n";

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-status-critical/30 bg-status-critical/5 px-6 py-8 text-center">
      <p className="text-sm font-medium text-status-critical">{t(message ?? "Something went wrong.")}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-medium text-brand-600 hover:underline">
          {t("Try again")}
        </button>
      )}
    </div>
  );
}
