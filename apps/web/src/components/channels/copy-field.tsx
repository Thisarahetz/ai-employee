"use client";

import { useState } from "react";

/** Read-only value with a copy-to-clipboard button — webhook URLs, embed snippets, tokens. */
export function CopyField({
  label,
  value,
  multiline,
}: {
  label?: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — user can still select the text */
    }
  }

  return (
    <div>
      {label && <p className="mb-1 text-sm font-medium text-ink-primary">{label}</p>}
      <div className="flex items-start gap-2">
        {multiline ? (
          <pre className="flex-1 overflow-x-auto rounded-md border border-line bg-surface-page px-3 py-2 text-xs text-ink-secondary">
            {value}
          </pre>
        ) : (
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-line bg-surface-page px-3 py-2 text-xs text-ink-secondary">
            {value}
          </code>
        )}
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-line px-3 py-2 text-xs font-medium text-ink-primary hover:bg-surface-page"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
