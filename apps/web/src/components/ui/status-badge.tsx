import { Badge, type BadgeColor } from "./badge";

/** Renders a `{ label, color }` pair from `src/lib/status-styles.ts` as a Badge. */
export function StatusBadge({ label, color }: { label: string; color: BadgeColor }) {
  return <Badge color={color}>{label}</Badge>;
}
