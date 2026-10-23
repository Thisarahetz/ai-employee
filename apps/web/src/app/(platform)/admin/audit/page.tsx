"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Filter, RefreshCw, Search, ShieldCheck } from "lucide-react";

import { useAdminAuditLog } from "@/lib/hooks/use-admin";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import type { PlatformAuditEntry } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const PAGE_SIZE = 25;

const TARGET_TYPES = [
  { label: "All Target Types", value: "" },
  { label: "Tenants", value: "tenant" },
  { label: "Users", value: "user" },
  { label: "Platform", value: "platform" },
];

export default function AdminAuditPage() {
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const auditQuery = useAdminAuditLog({
    targetType: targetType || undefined,
    targetId: targetId.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = auditQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Platform Audit Logs</h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              Immutable Records
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Complete cryptographic audit trail of all actions performed by Super Admins across the instance.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => auditQuery.refetch()}
          isLoading={auditQuery.isFetching}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-48">
          <Select
            aria-label="Filter by record type"
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              setPage(1);
            }}
          >
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <Input
            placeholder="Filter by Target ID..."
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <Card>
        {auditQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : auditQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(auditQuery.error, "Unable to load audit logs.")}
              onRetry={() => auditQuery.refetch()}
            />
          </div>
        ) : !auditQuery.data?.data.length ? (
          <div className="p-8">
            <EmptyState title="No audit entries" description="No administrative actions match your filter." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-muted bg-surface-page/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Target</th>
                  <th className="px-5 py-3 font-semibold">Super Admin Actor</th>
                  <th className="px-5 py-3 font-semibold">IP Address</th>
                  <th className="px-5 py-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {auditQuery.data.data.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <tr key={entry.id} className="hover:bg-surface-page/80">
                      <td className="px-5 py-3.5 text-xs text-ink-secondary whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-semibold bg-brand-50 text-brand-800 px-2 py-0.5 rounded">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span className="capitalize font-medium text-ink-primary">{entry.targetType}</span>:{" "}
                        <span className="font-mono text-ink-muted">{entry.targetId}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span className="font-medium text-ink-primary">
                          {entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : "Super Admin"}
                        </span>
                        <p className="text-[11px] text-ink-muted">{entry.actor?.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-mono text-ink-muted">
                        {entry.ipAddress || "Internal"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Expanded JSON diff panel */}
      {expandedId && (
        <Card className="p-4 bg-slate-900 text-slate-100 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">Mutated Payload (ID: {expandedId})</span>
            <Button variant="ghost" size="sm" onClick={() => setExpandedId(null)} className="text-slate-300">
              Close
            </Button>
          </div>
          <pre className="text-xs font-mono overflow-x-auto p-2 bg-slate-950 rounded-lg">
            {JSON.stringify(
              auditQuery.data?.data.find((e) => e.id === expandedId)?.changes,
              null,
              2,
            )}
          </pre>
        </Card>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-secondary">
          <span>
            {total} audit record{total === 1 ? "" : "s"} · page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
