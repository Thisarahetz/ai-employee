"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { useAdminTenant, useAdminTenantUsers, useUpdateTenant } from "@/lib/hooks/use-admin";
import { tenantStatusStyles } from "@/lib/status-styles";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import type { TenantStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";

const TENANT_STATUSES: TenantStatus[] = ["TRIAL", "ACTIVE", "SUSPENDED"];

export default function AdminTenantDetailPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tenantId = params.id;

  useEffect(() => {
    if (!isAuthLoading && (!user || user.platformRole === "NONE")) {
      router.replace("/dashboard");
    }
  }, [isAuthLoading, user, router]);

  const tenantQuery = useAdminTenant(tenantId);
  const usersQuery = useAdminTenantUsers(tenantId);
  const updateTenant = useUpdateTenant();

  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState<TenantStatus>("TRIAL");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed the editable form once the tenant loads (not on every refetch, so
  // in-progress edits aren't clobbered by background React Query refetches).
  useEffect(() => {
    if (tenantQuery.data) {
      setName(tenantQuery.data.name);
      setPlan(tenantQuery.data.plan);
      setStatus(tenantQuery.data.status);
    }
  }, [tenantQuery.data]);

  if (isAuthLoading || !user || user.platformRole === "NONE") {
    return null;
  }

  if (tenantQuery.isLoading) return <FullPageSpinner />;

  if (tenantQuery.isError || !tenantQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(tenantQuery.error, "Unable to load this tenant.")}
        onRetry={() => tenantQuery.refetch()}
      />
    );
  }

  async function handleSave() {
    setSaveError(null);
    try {
      await updateTenant.mutateAsync({ id: tenantId, name, plan, status });
    } catch (err) {
      setSaveError(getErrorMessage(err, "Unable to save changes."));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs font-medium text-brand-600 hover:underline">
          &larr; All tenants
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-ink-primary">{tenantQuery.data.name}</h1>
          <StatusBadge {...tenantStatusStyles[tenantQuery.data.status]} />
        </div>
        <p className="text-sm text-ink-secondary">{tenantQuery.data.slug}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {saveError && (
            <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
              {saveError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} />
          </div>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)}>
            {TENANT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tenantStatusStyles[s].label}
              </option>
            ))}
          </Select>
          <Button onClick={handleSave} isLoading={updateTenant.isPending}>
            Save changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(usersQuery.error, "Unable to load users.")}
              onRetry={() => usersQuery.refetch()}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usersQuery.data?.map((membership) => (
                  <tr key={membership.id}>
                    <td className="px-5 py-3 text-ink-primary">
                      {membership.user.firstName} {membership.user.lastName}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{membership.user.email}</td>
                    <td className="px-5 py-3 text-ink-secondary">{membership.role}</td>
                    <td className="px-5 py-3 text-ink-secondary">{membership.status}</td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {membership.user.lastLoginAt ? formatDateTime(membership.user.lastLoginAt) : "Never"}
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
