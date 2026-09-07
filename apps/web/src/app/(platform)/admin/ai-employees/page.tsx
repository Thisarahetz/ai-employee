"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  Eye,
  Filter,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  X,
} from "lucide-react";

import { useAdminAiEmployees, useUpdateAdminAiEmployeeStatus } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import type { AdminAiEmployee } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Paused", value: "PAUSED" },
  { label: "Needs Attention", value: "NEEDS_ATTENTION" },
];

const ACTION_LEVEL_OPTIONS = [
  { label: "All Action Levels", value: "ALL" },
  { label: "Automatic", value: "AUTOMATIC" },
  { label: "Approval Required", value: "APPROVAL_REQUIRED" },
  { label: "Owner Only", value: "OWNER_ONLY" },
];

export default function AdminAiEmployeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [actionLevelFilter, setActionLevelFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const [inspectEmployee, setInspectEmployee] = useState<AdminAiEmployee | null>(null);

  const employeesQuery = useAdminAiEmployees({
    search: search.trim() || undefined,
    status: statusFilter !== "ALL" ? statusFilter : undefined,
    actionLevel: actionLevelFilter !== "ALL" ? actionLevelFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const updateStatus = useUpdateAdminAiEmployeeStatus();

  const total = employeesQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleToggleStatus(employee: AdminAiEmployee) {
    const nextStatus = employee.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await updateStatus.mutateAsync({ id: employee.id, status: nextStatus });
    } catch (err) {
      alert(getErrorMessage(err, "Failed to update employee status."));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Platform AI Employees</h1>
            <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
              Cross-Tenant Oversight
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Real-time monitoring and administrative controls for all AI employees operating across businesses.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => employeesQuery.refetch()}
          isLoading={employeesQuery.isFetching}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <Input
            placeholder="Search employee, role, or business..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-48">
            <Select
              value={actionLevelFilter}
              onChange={(e) => {
                setActionLevelFilter(e.target.value);
                setPage(1);
              }}
            >
              {ACTION_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        {employeesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : employeesQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(employeesQuery.error, "Unable to load AI employees.")}
              onRetry={() => employeesQuery.refetch()}
            />
          </div>
        ) : !employeesQuery.data?.data.length ? (
          <div className="p-8">
            <EmptyState
              title="No AI Employees Found"
              description={search || statusFilter !== "ALL" ? "No AI employee matches your search criteria." : "No AI employees have been deployed across businesses yet."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-muted bg-surface-page/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">AI Employee</th>
                  <th className="px-5 py-3 font-semibold">Business Tenant</th>
                  <th className="px-5 py-3 font-semibold">Department & Function</th>
                  <th className="px-5 py-3 font-semibold">Action Level</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-center">Activities</th>
                  <th className="px-5 py-3 font-semibold text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {employeesQuery.data.data.map((emp) => (
                  <tr key={emp.id} className="hover:bg-surface-page/80 transition-colors">
                    {/* Employee Profile */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700 font-bold">
                          <Bot className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-ink-primary">{emp.name}</p>
                          <p className="text-xs text-ink-muted">{emp.role}</p>
                        </div>
                      </div>
                    </td>

                    {/* Tenant */}
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/tenants/${emp.tenant.id}`}
                        className="font-medium text-xs text-brand-600 hover:underline flex items-center gap-1.5"
                      >
                        <Building2 className="h-3.5 w-3.5 text-ink-muted" />
                        {emp.tenant.name}
                      </Link>
                      <p className="text-[10px] text-ink-muted capitalize mt-0.5">{emp.tenant.plan} tier</p>
                    </td>

                    {/* Department & Function */}
                    <td className="px-5 py-3.5 text-xs text-ink-secondary">
                      <p className="font-medium text-ink-primary">{emp.department}</p>
                      <p className="text-[11px] text-ink-muted truncate max-w-xs">{emp.businessFunction}</p>
                    </td>

                    {/* Action Level */}
                    <td className="px-5 py-3.5">
                      <span className="rounded bg-surface-page px-2 py-0.5 text-xs font-medium uppercase text-ink-secondary">
                        {emp.actionLevel.replace("_", " ")}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <Badge
                        color={
                          emp.status === "ACTIVE"
                            ? "green"
                            : emp.status === "NEEDS_ATTENTION"
                            ? "red"
                            : "gray"
                        }
                      >
                        {emp.status}
                      </Badge>
                    </td>

                    {/* Activities */}
                    <td className="px-5 py-3.5 text-center font-medium text-xs text-ink-secondary">
                      {emp.activityCount}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setInspectEmployee(emp)}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          Inspect
                        </Button>

                        <Button
                          variant={emp.status === "ACTIVE" ? "ghost" : "primary"}
                          size="sm"
                          className={emp.status === "ACTIVE" ? "text-amber-600 hover:bg-amber-50" : ""}
                          isLoading={updateStatus.isPending}
                          onClick={() => handleToggleStatus(emp)}
                        >
                          {emp.status === "ACTIVE" ? (
                            <>
                              <Pause className="mr-1 h-3.5 w-3.5" />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="mr-1 h-3.5 w-3.5" />
                              Resume
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-secondary">
          <span>
            Showing {employeesQuery.data?.data.length} of {total} AI employees · page {page} of {pageCount}
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

      {/* Inspect Modal/Drawer */}
      {inspectEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink-primary">{inspectEmployee.name}</h3>
                  <p className="text-xs text-ink-secondary">
                    {inspectEmployee.role} · {inspectEmployee.department} · {inspectEmployee.tenant.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectEmployee(null)}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-page hover:text-ink-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-semibold uppercase tracking-wider text-ink-muted text-[11px]">Description</h4>
                <p className="mt-1 text-ink-primary">{inspectEmployee.description}</p>
              </div>

              <div>
                <h4 className="font-semibold uppercase tracking-wider text-ink-muted text-[11px]">System Prompt / Instructions</h4>
                <div className="mt-1 rounded-lg bg-surface-page p-3 font-mono text-[11px] text-ink-primary whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {inspectEmployee.systemPrompt || "Standard business system prompt configured."}
                </div>
              </div>

              <div>
                <h4 className="font-semibold uppercase tracking-wider text-ink-muted text-[11px]">Responsibilities</h4>
                <ul className="mt-1 list-disc pl-4 space-y-1 text-ink-secondary">
                  {inspectEmployee.responsibilities && inspectEmployee.responsibilities.length > 0 ? (
                    inspectEmployee.responsibilities.map((r, i) => <li key={i}>{r}</li>)
                  ) : (
                    <li>Standard industry responsibilities</li>
                  )}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold uppercase tracking-wider text-ink-muted text-[11px]">Permissions</h4>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(inspectEmployee.permissions || {}).map(([key, enabled]) => (
                    <span
                      key={key}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {key}: {enabled ? "Allowed" : "Restricted"}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-line">
              <Button variant="secondary" onClick={() => setInspectEmployee(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
