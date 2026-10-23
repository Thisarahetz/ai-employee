"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  ExternalLink,
  Filter,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { useAdminTenants, useDeleteTenant, useUpdateTenant } from "@/lib/hooks/use-admin";
import { tenantStatusStyles } from "@/lib/status-styles";
import { formatDate, getErrorMessage } from "@/lib/utils";
import type { TenantStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { CreateTenantForm } from "@/components/platform/create-tenant-form";

const PAGE_SIZE = 20;

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All Businesses", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Trial", value: "TRIAL" },
  { label: "Suspended", value: "SUSPENDED" },
];

const PLAN_OPTIONS = [
  { label: "All Plans", value: "ALL" },
  { label: "Free / Trial", value: "free" },
  { label: "Starter", value: "starter" },
  { label: "Professional", value: "pro" },
  { label: "Business Scale", value: "business" },
  { label: "Enterprise", value: "enterprise" },
];

export default function AdminTenantsListPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [statusTab, setStatusTab] = useState("ALL");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const tenantsQuery = useAdminTenants({
    search: search.trim() || undefined,
    status: statusTab !== "ALL" ? statusTab : undefined,
    plan: planFilter !== "ALL" ? planFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const updateTenant = useUpdateTenant();
  const deleteTenant = useDeleteTenant();

  const total = tenantsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleStatusChange(tenantId: string, status: TenantStatus) {
    try {
      await updateTenant.mutateAsync({ id: tenantId, status });
    } catch (err) {
      alert(getErrorMessage(err, "Failed to update tenant status."));
    }
  }

  async function handlePlanChange(tenantId: string, plan: string) {
    try {
      await updateTenant.mutateAsync({ id: tenantId, plan });
    } catch (err) {
      alert(getErrorMessage(err, "Failed to update tenant plan."));
    }
  }

  async function handleDelete(tenantId: string) {
    try {
      await deleteTenant.mutateAsync(tenantId);
      setConfirmDeleteId(null);
    } catch (err) {
      alert(getErrorMessage(err, "Failed to delete tenant."));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Businesses / Tenants</h1>
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              {total} registered
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Manage business accounts, active subscriptions, branches, and platform access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => tenantsQuery.refetch()}
            isLoading={tenantsQuery.isFetching}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {isCreateOpen ? "Close Form" : "Onboard Business"}
          </Button>
        </div>
      </div>

      {isCreateOpen && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-900">Create New Business Tenant</h3>
            <span className="text-xs text-brand-700">Platform Admin Onboarding</span>
          </div>
          <CreateTenantForm onDone={() => setIsCreateOpen(false)} />
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusTab(tab.value);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusTab === tab.value
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Plan Filter */}
        <div className="flex items-center gap-3">
          <div className="w-44">
            <Select
              aria-label="Filter by plan"
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
            <Input
              placeholder="Search business or owner..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Table Card */}
      <Card>
        {tenantsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : tenantsQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(tenantsQuery.error, "Unable to load business tenants.")}
              onRetry={() => tenantsQuery.refetch()}
            />
          </div>
        ) : !tenantsQuery.data?.data.length ? (
          <div className="p-8">
            <EmptyState
              title="No businesses found"
              description={search || statusTab !== "ALL" ? "No tenant matches the selected filter or search criteria." : "No businesses have registered on the platform yet."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-muted bg-surface-page/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Business</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Primary Owner</th>
                  <th className="px-5 py-3 font-semibold text-center">Branches</th>
                  <th className="px-5 py-3 font-semibold text-center">AI Employees</th>
                  <th className="px-5 py-3 font-semibold text-center">Users</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tenantsQuery.data.data.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-surface-page/80 transition-colors">
                    {/* Business Name & Slug */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            className="font-semibold text-ink-primary hover:text-brand-600 hover:underline"
                          >
                            {tenant.name}
                          </Link>
                          <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-0.5">
                            <span className="font-mono">{tenant.slug}</span>
                            {tenant.businessType && (
                              <span className="rounded bg-surface-page px-1 text-[10px] uppercase font-medium">
                                {tenant.businessType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-700">
                        {tenant.plan}
                      </span>
                    </td>

                    {/* Owner */}
                    <td className="px-5 py-3.5">
                      {tenant.owner ? (
                        <div>
                          <p className="font-medium text-xs text-ink-primary">
                            {tenant.owner.firstName} {tenant.owner.lastName}
                          </p>
                          <p className="text-[11px] text-ink-muted">{tenant.owner.email}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>

                    {/* Branches */}
                    <td className="px-5 py-3.5 text-center font-medium text-ink-secondary">
                      {tenant.branchCount ?? 1}
                    </td>

                    {/* AI Employees */}
                    <td className="px-5 py-3.5 text-center">
                      <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                        {tenant.aiEmployeeCount ?? 0}
                      </span>
                    </td>

                    {/* Users */}
                    <td className="px-5 py-3.5 text-center font-medium text-ink-secondary">
                      {tenant.userCount}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusBadge {...tenantStatusStyles[tenant.status]} />
                    </td>

                    {/* Created */}
                    <td className="px-5 py-3.5 text-xs text-ink-secondary whitespace-nowrap">
                      {formatDate(tenant.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/admin/tenants/${tenant.id}`}
                          className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-ink-primary hover:bg-surface-page"
                        >
                          View Details
                        </Link>

                        {tenant.status === "SUSPENDED" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStatusChange(tenant.id, "ACTIVE")}
                            isLoading={updateTenant.isPending}
                          >
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-status-critical hover:bg-status-critical/10"
                            onClick={() => handleStatusChange(tenant.id, "SUSPENDED")}
                            isLoading={updateTenant.isPending}
                          >
                            Suspend
                          </Button>
                        )}
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
            Showing {tenantsQuery.data?.data.length} of {total} businesses · page {page} of {pageCount}
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
