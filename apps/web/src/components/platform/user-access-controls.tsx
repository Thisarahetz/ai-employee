"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useUpdateUser } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import type { AdminUserDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function UserAccessControls({ user }: { user: AdminUserDetail }) {
  const { user: currentUser, logout } = useAuth();
  const updateUser = useUpdateUser();
  const [error, setError] = useState<string | null>(null);

  const isSelf = currentUser?.id === user.id;
  const isSuperAdmin = user.platformRole === "SUPER_ADMIN";
  const isDisabled = user.status === "DISABLED";

  async function run(patch: Parameters<typeof updateUser.mutateAsync>[0]) {
    setError(null);
    try {
      await updateUser.mutateAsync(patch);
      // Stepped down from your own super-admin access — end the session so the
      // console guard doesn't leave a stale role sitting in local storage.
      if (isSelf && patch.platformRole === "NONE") logout();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update this account."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-primary">Super admin</p>
            <p className="text-xs text-ink-muted">
              Full cross-tenant access to this console. The last active super admin can&apos;t be removed.
            </p>
          </div>
          <Button
            variant={isSuperAdmin ? "secondary" : "primary"}
            size="sm"
            disabled={updateUser.isPending}
            isLoading={updateUser.isPending}
            onClick={() => run({ id: user.id, platformRole: isSuperAdmin ? "NONE" : "SUPER_ADMIN" })}
          >
            {isSuperAdmin ? "Revoke super admin" : "Grant super admin"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-primary">Account status</p>
            <p className="text-xs text-ink-muted">
              {isSelf
                ? "You can't disable your own account."
                : "Disabling blocks login everywhere and ends the account's active session."}
            </p>
          </div>
          <Button
            variant={isDisabled ? "primary" : "danger"}
            size="sm"
            disabled={isSelf || updateUser.isPending}
            isLoading={updateUser.isPending}
            onClick={() => run({ id: user.id, status: isDisabled ? "ACTIVE" : "DISABLED" })}
          >
            {isDisabled ? "Enable account" : "Disable account"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
