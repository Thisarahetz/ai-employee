"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { useAdminUsers } from "@/lib/hooks/use-admin";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminUsersPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const usersQuery = useAdminUsers();

  // Defense in depth — see app/(dashboard)/admin/page.tsx for the same pattern.
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
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Platform users</h1>
        <p className="text-sm text-ink-secondary">Every global identity on this AI Employee instance, across all tenants.</p>
      </div>

      <Card>
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <div className="p-5">
            <ErrorState message={getErrorMessage(usersQuery.error, "Unable to load users.")} onRetry={() => usersQuery.refetch()} />
          </div>
        ) : !usersQuery.data?.length ? (
          <div className="p-5">
            <EmptyState title="No users" description="No one has signed up yet." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Tenants</th>
                  <th className="px-5 py-3 font-medium">Platform role</th>
                  <th className="px-5 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usersQuery.data.map((platformUser) => (
                  <tr key={platformUser.id}>
                    <td className="px-5 py-3 text-ink-primary">
                      {platformUser.firstName} {platformUser.lastName}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{platformUser.email}</td>
                    <td className="px-5 py-3 text-ink-secondary">{platformUser.membershipCount}</td>
                    <td className="px-5 py-3">
                      {platformUser.platformRole !== "NONE" ? (
                        <Badge color="purple">{platformUser.platformRole}</Badge>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {platformUser.lastLoginAt ? formatDateTime(platformUser.lastLoginAt) : "Never"}
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
