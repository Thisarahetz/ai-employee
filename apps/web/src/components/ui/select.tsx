"use client";

import { forwardRef, useId, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, error, id, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink-primary">
          {label}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        className={cn(
          "block w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-primary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
          error && "border-status-critical focus:border-status-critical focus:ring-status-critical",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-status-critical">{error}</p>}
    </div>
  );
});
