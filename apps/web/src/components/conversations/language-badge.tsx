"use client";

import { Badge } from "@/components/ui/badge";
import { CUSTOMER_LANGUAGE_LABELS, useI18n } from "@/lib/i18n";

/** Which language the customer writes in. Unknown shows a dash. */
export function LanguageBadge({ language }: { language?: string | null }) {
  const { t } = useI18n();
  const label = language ? CUSTOMER_LANGUAGE_LABELS[language] : undefined;
  if (!label) return <span className="text-ink-muted">—</span>;
  return <Badge color={language === "en" ? "gray" : "blue"}>{t(label)}</Badge>;
}
