"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-primary">{t(title)}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-secondary">{t(description)}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
