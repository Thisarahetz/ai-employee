"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-primary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={cn(
          "block w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
          error && "border-status-critical focus:border-status-critical focus:ring-status-critical",
          className,
        )}
        {...props}
      />
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-status-critical">{error}</p>}
    </div>
  );
});
