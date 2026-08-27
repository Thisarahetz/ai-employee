"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAdminUser } from "@/lib/hooks/use-admin";
import { tenantStatusStyles, userStatusStyles } from "@/lib/status-styles";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { PlatformActivity } from "@/components/platform/platform-activity";
import { UserAccessControls } from "@/components/platform/user-access-controls";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const userQuery = useAdminUser(userId);

  if (userQuery.isLoading) return <FullPageSpinner />;

  if (userQuery.isError || !userQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(userQuery.error, "Unable to load this user.")}
        onRetry={() => userQuery.refetch()}
      />
    );
  }

  const user = userQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-xs font-medium text-brand-600 hover:underline">
          &larr; All platform users
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-ink-primary">
            {user.firstName} {user.lastName}
          </h1>
          <StatusBadge {...userStatusStyles[user.status]} />
          {user.platformRole !== "NONE" && <Badge color="purple">{user.platformRole}</Badge>}
        </div>
        <p className="text-sm text-ink-secondary">{user.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">Joined</dt>
              <dd className="mt-1 text-ink-primary">{formatDateTime(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">Last login</dt>
              <dd className="mt-1 text-ink-primary">
                {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">Tenants</dt>
              <dd className="mt-1 text-ink-primary">{user.membershipCount}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <UserAccessControls user={user} />

      <Card>
        <CardHeader>
          <CardTitle>Tenant memberships</CardTitle>
        </CardHeader>
        {!user.memberships.length ? (
          <CardContent>
            <EmptyState title="No tenant memberships" description="This account only has platform-level access." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Tenant</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Membership</th>
                  <th className="px-5 py-3 font-medium">Tenant status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {user.memberships.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/tenants/${m.tenant.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {m.tenant.name}
                      </Link>
                      <p className="text-xs text-ink-muted">{m.tenant.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{m.role}</td>
                    <td className="px-5 py-3 text-ink-secondary">{m.status}</td>
                    <td className="px-5 py-3">
                      <StatusBadge {...tenantStatusStyles[m.tenant.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PlatformActivity targetType="user" targetId={userId} />
    </div>
  );
}
