"use client";

import { useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";

import type { AiEmployeeApproval } from "@/lib/types";
import { useDecideApproval } from "@/lib/hooks/use-ai-workforce";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/utils";

/** A pending action an AI employee prepared in this conversation. */
export function InlineApproval({ approval }: { approval: AiEmployeeApproval }) {
  const decide = useDecideApproval();
  const [result, setResult] = useState<string | null>(null);
  const args = (approval.actionPayload?.args ?? null) as Record<string, unknown> | null;

  const submit = async (decision: "APPROVED" | "REJECTED") => {
    try {
      const res = await decide.mutateAsync({ id: approval.id, decision });
      setResult(res.execution?.message ?? (decision === "APPROVED" ? "Approved." : "Rejected."));
    } catch {
      // Error shown below.
    }
  };

  return (
    <div className="rounded-xl border border-status-warning/40 bg-status-warning/[0.07] p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8a5a00]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-primary">{approval.title}</p>
          {approval.task && <p className="text-[11px] text-ink-muted">For task: {approval.task.title}</p>}
          {args && Object.keys(args).length > 0 && (
            <dl className="mt-2 space-y-1 rounded-lg bg-white/70 p-2 text-xs">
              {Object.entries(args).slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-16 shrink-0 font-medium text-ink-muted">{k}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words text-ink-primary">
                    {typeof v === "string" ? (v.length > 400 ? `${v.slice(0, 400)}…` : v) : JSON.stringify(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {result ? (
        <p className="mt-2 text-xs text-ink-secondary">{result}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {decide.isError && <span className="mr-auto text-xs text-status-critical">{getErrorMessage(decide.error)}</span>}
          <Button size="sm" variant="secondary" onClick={() => submit("REJECTED")} disabled={decide.isPending}>
            <X className="h-3.5 w-3.5" /> Reject
          </Button>
          <Button size="sm" onClick={() => submit("APPROVED")} isLoading={decide.isPending}>
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
        </div>
      )}
    </div>
  );
}
