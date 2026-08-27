"use client";

import { useState } from "react";
import Link from "next/link";

import { useAdminTenants } from "@/lib/hooks/use-admin";
import { tenantStatusStyles } from "@/lib/status-styles";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { CreateTenantForm } from "@/components/platform/create-tenant-form";

const PAGE_SIZE = 25;

export default function AdminTenantsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const tenantsQuery = useAdminTenants({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE });
  const total = tenantsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Tenants</h1>
          <p className="text-sm text-ink-secondary">
            Every tenant on this AI Employee instance. Cross-tenant, platform-wide.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen((v) => !v)}>{isCreateOpen ? "Close" : "+ Create tenant"}</Button>
      </div>

      {isCreateOpen && <CreateTenantForm onDone={() => setIsCreateOpen(false)} />}

      <div className="max-w-xs">
        <Input
          placeholder="Search by name or slug"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <Card>
        {tenantsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : tenantsQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(tenantsQuery.error, "Unable to load tenants.")}
              onRetry={() => tenantsQuery.refetch()}
            />
          </div>
        ) : !tenantsQuery.data?.data.length ? (
          <div className="p-5">
            <EmptyState
              title="No tenants"
              description={search ? "No tenant matches that search." : "No tenant has signed up yet."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Tenant</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Users</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tenantsQuery.data.data.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-surface-page">
                    <td className="px-5 py-3">
                      <Link href={`/admin/tenants/${tenant.id}`} className="font-medium text-brand-600 hover:underline">
                        {tenant.name}
                      </Link>
                      <p className="text-xs text-ink-muted">{tenant.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{tenant.plan}</td>
                    <td className="px-5 py-3 text-ink-secondary">{tenant.userCount}</td>
                    <td className="px-5 py-3">
                      <StatusBadge {...tenantStatusStyles[tenant.status]} />
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{formatDate(tenant.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-secondary">
          <span>
            {total} tenant{total === 1 ? "" : "s"} · page {page} of {pageCount}
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
