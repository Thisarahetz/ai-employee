"use client";

import { useState } from "react";
import Link from "next/link";

import { useAdminUsers } from "@/lib/hooks/use-admin";
import { userStatusStyles } from "@/lib/status-styles";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const usersQuery = useAdminUsers({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE });
  const total = usersQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Platform users</h1>
        <p className="text-sm text-ink-secondary">Every global identity on this AI Employee instance, across all tenants.</p>
      </div>

      <div className="max-w-xs">
        <Input
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <Card>
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <div className="p-5">
            <ErrorState message={getErrorMessage(usersQuery.error, "Unable to load users.")} onRetry={() => usersQuery.refetch()} />
          </div>
        ) : !usersQuery.data?.data.length ? (
          <div className="p-5">
            <EmptyState
              title="No users"
              description={search ? "No user matches that search." : "No one has signed up yet."}
            />
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
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usersQuery.data.data.map((platformUser) => (
                  <tr key={platformUser.id} className="hover:bg-surface-page">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/users/${platformUser.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {platformUser.firstName} {platformUser.lastName}
                      </Link>
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
                    <td className="px-5 py-3">
                      <StatusBadge {...userStatusStyles[platformUser.status]} />
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

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-secondary">
          <span>
            {total} user{total === 1 ? "" : "s"} · page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
