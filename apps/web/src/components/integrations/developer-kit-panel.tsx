"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { developerGuide, downloadText, envBlock, type DeveloperKit } from "@/lib/developer-guide";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/channels/copy-field";

/**
 * The keys and instructions an owner hands to their developer. Secrets are
 * shown only here, once — after that only new keys can be issued.
 */
export function DeveloperKitPanel({ kit }: { kit: DeveloperKit }) {
  const { activeTenant } = useAuth();
  const [copied, setCopied] = useState(false);
  const guide = developerGuide(kit, activeTenant?.name);
  const fileName = `ai-employee-${kit.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-developer-guide.md`;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(guide);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the download button still works */
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-status-warning/10 px-3 py-2 text-sm text-ink-primary">
        Save or send this now. The keys are shown only once. If they get lost, you can create new keys later.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => downloadText(fileName, guide)}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Download developer guide
        </Button>
        <Button size="sm" variant="secondary" onClick={copyAll}>
          {copied ? "Copied" : "Copy guide to send by email or chat"}
        </Button>
      </div>
      <p className="text-sm text-ink-secondary">
        The guide has the keys, a one-command setup for Node.js, examples for other languages, and how to check the
        work. Your developer only needs to send you back one thing: the <strong>Base URL</strong>.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-secondary">Show the keys</summary>
        <div className="mt-3">
          <CopyField label="Settings for the developer's .env" value={envBlock(kit)} multiline />
        </div>
      </details>
    </div>
  );
}
