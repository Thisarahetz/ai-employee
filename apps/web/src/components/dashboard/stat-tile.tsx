import { Card } from "@/components/ui/card";
import { formatCompactNumber } from "@/lib/utils";

export function StatTile({
  label,
  value,
  isLoading,
  hint,
}: {
  label: string;
  value: number | string;
  isLoading?: boolean;
  hint?: string;
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-ink-secondary">{label}</p>
      {isLoading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-surface-page" />
      ) : (
        <p className="mt-1 text-3xl font-semibold text-ink-primary">
          {typeof value === "number" ? formatCompactNumber(value) : value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}
