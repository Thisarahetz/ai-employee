"use client";

import { useAdminAuditLog } from "@/lib/hooks/use-admin";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTION_LABELS: Record<string, string> = {
  "tenant.create": "Tenant created",
  "tenant.update": "Tenant updated",
  "tenant.suspend": "Tenant suspended",
  "tenant.activate": "Tenant activated",
  "user.grant_super_admin": "Granted super admin",
  "user.revoke_super_admin": "Revoked super admin",
  "user.disable": "Account disabled",
  "user.enable": "Account enabled",
};

/** Read-only "who did what" panel, scoped to one tenant or user. */
export function PlatformActivity({ targetType, targetId }: { targetType: "tenant" | "user"; targetId: string }) {
  const query = useAdminAuditLog({ targetType, targetId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent admin activity</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : !query.data?.data.length ? (
          <p className="text-sm text-ink-muted">No admin actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {query.data.data.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 py-2.5">
                <div>
                  <p className="font-medium text-ink-primary">{ACTION_LABELS[entry.action] ?? entry.action}</p>
                  <p className="text-xs text-ink-muted">
                    {entry.actor.firstName} {entry.actor.lastName} · {entry.actor.email}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-muted">{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
