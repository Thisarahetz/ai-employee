import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeColor = "blue" | "green" | "amber" | "red" | "gray" | "purple";

const colorClasses: Record<BadgeColor, string> = {
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  green: "bg-status-good/10 text-emerald-700 ring-status-good/25",
  amber: "bg-status-warning/15 text-[#8a5a00] ring-status-warning/30",
  red: "bg-status-critical/10 text-status-critical ring-status-critical/20",
  gray: "bg-ink-muted/10 text-ink-secondary ring-ink-muted/20",
  purple: "bg-[#4a3aa7]/10 text-[#4a3aa7] ring-[#4a3aa7]/20",
};

export function Badge({
  color = "gray",
  children,
  className,
}: {
  color?: BadgeColor;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        colorClasses[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
