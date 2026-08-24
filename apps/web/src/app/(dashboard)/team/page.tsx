"use client";

import { useState } from "react";

import { useRemoveMember, useTeam, useUpdateMember } from "@/lib/hooks/use-team";
import { getErrorMessage } from "@/lib/utils";
import type { MembershipStatus, TenantRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { InviteMemberForm } from "@/components/team/invite-member-form";

const TENANT_ROLES: TenantRole[] = ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"];
const MEMBERSHIP_STATUSES: MembershipStatus[] = ["ACTIVE", "INVITED", "DISABLED"];

export default function TeamPage() {
  const teamQuery = useTeam();
  const updateMember = useUpdateMember();
  const removeMember = useRemoveMember();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleRemove(id: string) {
    setRowError(null);
    try {
      await removeMember.mutateAsync(id);
    } catch (err) {
      setRowError(getErrorMessage(err, "Unable to remove this member."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Team</h1>
          <p className="text-sm text-ink-secondary">Everyone with access to this tenant, and their role.</p>
        </div>
        <Button onClick={() => setIsInviteOpen((v) => !v)}>{isInviteOpen ? "Close" : "+ Invite member"}</Button>
      </div>

      {isInviteOpen && <InviteMemberForm onDone={() => setIsInviteOpen(false)} />}

      {rowError && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {rowError}
        </p>
      )}

      <Card>
        {teamQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : teamQuery.isError ? (
          <div className="p-5">
            <ErrorState message={getErrorMessage(teamQuery.error, "Unable to load the team.")} onRetry={() => teamQuery.refetch()} />
          </div>
        ) : !teamQuery.data?.length ? (
          <div className="p-5">
            <EmptyState title="No team members" description="Invite someone to help manage this tenant." />
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
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {teamQuery.data.map((member) => (
                  <tr key={member.id} className="hover:bg-surface-page">
                    <td className="px-5 py-3 text-ink-primary">
                      {member.user.firstName} {member.user.lastName}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{member.user.email}</td>
                    <td className="px-5 py-3">
                      <Select
                        aria-label={`Role for ${member.user.email}`}
                        className="w-auto"
                        value={member.role}
                        disabled={updateMember.isPending}
                        onChange={(e) => updateMember.mutate({ id: member.id, role: e.target.value as TenantRole })}
                      >
                        {TENANT_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        aria-label={`Status for ${member.user.email}`}
                        className="w-auto"
                        value={member.status}
                        disabled={updateMember.isPending}
                        onChange={(e) =>
                          updateMember.mutate({ id: member.id, status: e.target.value as MembershipStatus })
                        }
                      >
                        {MEMBERSHIP_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={removeMember.isPending}
                        onClick={() => handleRemove(member.id)}
                      >
                        Remove
                      </Button>
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
