import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-line bg-white shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  actions,
}: {
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div>{children}</div>
      {actions}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn("text-sm font-semibold text-ink-primary", className)}>{children}</h3>;
}

export function CardDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("mt-0.5 text-xs text-ink-secondary", className)}>{children}</p>;
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
