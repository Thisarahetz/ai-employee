"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  X,
  Bot,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AiEmployeeApproval } from "@/lib/types";
import { useReviewApproval } from "@/lib/hooks/use-ai-employees";

interface ApprovalCardProps {
  approval: AiEmployeeApproval;
}

export function ApprovalCard({ approval }: ApprovalCardProps) {
  const reviewApproval = useReviewApproval();
  const [isExpanded, setIsExpanded] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isPending = approval.status === "PENDING";

  const handleApprove = () => {
    reviewApproval.mutate({
      id: approval.id,
      decision: "APPROVED",
    });
  };

  const handleReject = () => {
    reviewApproval.mutate({
      id: approval.id,
      decision: "REJECTED",
      reviewNotes: rejectNotes || undefined,
    });
    setShowRejectInput(false);
  };

  return (
    <div
      className={`rounded-xl border p-4 shadow-xs transition-all ${
        isPending
          ? "border-amber-300 bg-amber-50/40"
          : approval.status === "APPROVED"
          ? "border-emerald-200 bg-emerald-50/20"
          : "border-red-200 bg-red-50/20"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isPending
                ? "bg-amber-700 text-white"
                : approval.status === "APPROVED"
                ? "bg-emerald-600 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {isPending ? (
              <AlertTriangle className="h-5 w-5" />
            ) : approval.status === "APPROVED" ? (
              <Check className="h-5 w-5" />
            ) : (
              <X className="h-5 w-5" />
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-ink-primary text-sm">
                {approval.title}
              </h4>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  isPending
                    ? "bg-amber-200/80 text-amber-900"
                    : approval.status === "APPROVED"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {approval.status}
              </span>
            </div>

            <p className="text-xs text-ink-secondary mt-1">
              {approval.description}
            </p>

            <div className="flex items-center gap-3 mt-2 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1 font-medium text-ink-secondary">
                <Bot className="h-3 w-3 text-brand-600" />
                {approval.employee?.name || "AI Employee"} ({approval.employee?.role})
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(approval.requestedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Actions for Pending Status */}
        {isPending && (
          <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
            <button
              type="button"
              onClick={handleApprove}
              disabled={reviewApproval.isPending}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => setShowRejectInput(!showRejectInput)}
              disabled={reviewApproval.isPending}
              className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-xs hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Reject Reason input prompt if user clicked Reject */}
      {showRejectInput && isPending && (
        <div className="mt-3 pt-3 border-t border-amber-200 flex items-center gap-2 animate-in fade-in">
          <input
            type="text"
            placeholder="Reason for rejection (optional)..."
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            className="flex-1 rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleReject}
            disabled={reviewApproval.isPending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Confirm Rejection
          </button>
        </div>
      )}

      {/* Expanded payload details if needed */}
      {Object.keys(approval.actionPayload || {}).length > 0 && (
        <div className="mt-2 pt-2 border-t border-line/40">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-primary"
          >
            {isExpanded ? (
              <>
                Hide Details <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                View Action Data <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>

          {isExpanded && (
            <pre className="mt-2 rounded bg-white p-2 text-[10px] font-mono text-ink-secondary overflow-x-auto border border-line/60">
              {JSON.stringify(approval.actionPayload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
