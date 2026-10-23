"use client";

import { Badge, type BadgeColor } from "./badge";
import { useI18n } from "@/lib/i18n";

/** Renders a `{ label, color }` pair from `src/lib/status-styles.ts` as a Badge. */
export function StatusBadge({ label, color }: { label: string; color: BadgeColor }) {
  const { t } = useI18n();
  return <Badge color={color}>{t(label)}</Badge>;
}
