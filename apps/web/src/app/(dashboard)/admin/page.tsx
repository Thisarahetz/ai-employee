"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { useAdminTenants } from "@/lib/hooks/use-admin";
import { tenantStatusStyles } from "@/lib/status-styles";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { CreateTenantForm } from "@/components/admin/create-tenant-form";

export default function AdminPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const tenantsQuery = useAdminTenants();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Defense in depth: the sidebar link is already hidden for non-admins, and
  // the API's PlatformAdminGuard is the real enforcement — this just avoids
  // showing an empty/erroring page to someone who lands here directly.
  useEffect(() => {
    if (!isAuthLoading && (!user || user.platformRole === "NONE")) {
      router.replace("/dashboard");
    }
  }, [isAuthLoading, user, router]);

  if (isAuthLoading || !user || user.platformRole === "NONE") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Platform admin</h1>
          <p className="text-sm text-ink-secondary">
            Cross-tenant view — every tenant on this AI Employee instance, not just yours.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen((v) => !v)}>{isCreateOpen ? "Close" : "+ Create tenant"}</Button>
      </div>

      {isCreateOpen && <CreateTenantForm onDone={() => setIsCreateOpen(false)} />}

      <Card>
        {tenantsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(3)].map((_, i) => (
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
        ) : !tenantsQuery.data?.length ? (
          <div className="p-5">
            <EmptyState title="No tenants" description="No tenant has signed up yet." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Tenant</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Users</th>
                  <th className="px-5 py-3 font-medium">Conversations</th>
                  <th className="px-5 py-3 font-medium">Integrations</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tenantsQuery.data.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-surface-page">
                    <td className="px-5 py-3">
                      <Link href={`/admin/tenants/${tenant.id}`} className="font-medium text-brand-600 hover:underline">
                        {tenant.name}
                      </Link>
                      <p className="text-xs text-ink-muted">{tenant.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{tenant.plan}</td>
                    <td className="px-5 py-3 text-ink-secondary">{tenant.userCount}</td>
                    <td className="px-5 py-3 text-ink-secondary">{tenant.conversationCount}</td>
                    <td className="px-5 py-3 text-ink-secondary">{tenant.integrationCount}</td>
                    <td className="px-5 py-3">
                      <StatusBadge {...tenantStatusStyles[tenant.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
