"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { useTeam } from "@/lib/hooks/use-team";
import { getErrorMessage } from "@/lib/utils";
import type { TenantMembership } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TeamMemberModal } from "@/components/team/team-member-modal";
import { TeamMemberProfile } from "@/components/team/team-member-profile";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Search,
  Bot,
  ArrowRight,
  Shield,
  MapPin,
  ChevronRight,
  Plus,
} from "lucide-react";

export default function TeamPage() {
  const teamQuery = useTeam();
  const locationsQuery = useBusinesses();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INVITED" | "DISABLED">("ALL");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const team = useMemo(() => teamQuery.data ?? [], [teamQuery.data]);
  const locations = locationsQuery.data ?? [];

  // Metrics
  const activeCount = team.filter((m) => m.status === "ACTIVE").length;
  const pendingCount = team.filter((m) => m.status === "INVITED").length;
  const disabledCount = team.filter((m) => m.status === "DISABLED").length;

  // Filtered list
  const filteredMembers = useMemo(() => {
    return team.filter((member) => {
      // Search
      const search = searchQuery.toLowerCase().trim();
      if (search) {
        const name = `${member.user.firstName} ${member.user.lastName}`.toLowerCase();
        const email = member.user.email.toLowerCase();
        const phone = (member.user.phone || "").toLowerCase();
        const role = (member.jobTitle || member.businessRole || member.role).toLowerCase();
        if (!name.includes(search) && !email.includes(search) && !phone.includes(search) && !role.includes(search)) {
          return false;
        }
      }

      // Status
      if (statusFilter !== "ALL" && member.status !== statusFilter) {
        return false;
      }

      // Location
      if (locationFilter !== "ALL") {
        if (!member.allLocations && !member.locationIds?.includes(locationFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [team, searchQuery, statusFilter, locationFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-ink-primary">Team Members</h1>
            <span className="rounded-full bg-surface-page px-2.5 py-0.5 text-xs font-semibold text-ink-secondary border border-line">
              {team.length} {team.length === 1 ? "Member" : "Members"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-secondary">
            Manage the people who work in your business, assign their roles, and control branch access.
          </p>
        </div>

        <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-1.5 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Add Team Member
        </Button>
      </div>

      {/* Human Staff vs AI Employees Distinction Banner */}
      <div className="flex flex-col gap-3 rounded-xl border border-accent/25 bg-gradient-to-r from-accent-soft/30 via-surface-card to-surface-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">AI Workforce Separation</h3>
            <p className="text-xs text-ink-secondary mt-0.5">
              These are your <strong>Human Staff Members</strong>. To manage your autonomous AI agents, receptionists, and approval rules, switch to AI Employees.
            </p>
          </div>
        </div>
        <Link
          href="/ai-employees"
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-surface-card px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft/30 shrink-0 self-start sm:self-auto"
        >
          View AI Employees <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Total Staff</span>
            <Users className="h-4 w-4 text-ink-muted" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-primary">{team.length}</div>
          <p className="text-[11px] text-ink-muted mt-0.5">Across all locations</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-status-success">Active</span>
            <UserCheck className="h-4 w-4 text-status-success" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-primary">{activeCount}</div>
          <p className="text-[11px] text-ink-muted mt-0.5">Can access platform</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-status-warning">Pending Invites</span>
            <Clock className="h-4 w-4 text-status-warning" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-primary">{pendingCount}</div>
          <p className="text-[11px] text-ink-muted mt-0.5">Awaiting first login</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Inactive / Disabled</span>
            <UserX className="h-4 w-4 text-ink-muted" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-primary">{disabledCount}</div>
          <p className="text-[11px] text-ink-muted mt-0.5">Access paused</p>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            placeholder="Search by name, email, phone, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface-card pl-9 pr-4 text-xs text-ink-primary placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Pills */}
          <div className="flex items-center rounded-lg border border-line bg-surface-card p-0.5 text-xs">
            {(
              [
                { key: "ALL", label: "All" },
                { key: "ACTIVE", label: "Active" },
                { key: "INVITED", label: "Pending" },
                { key: "DISABLED", label: "Inactive" },
              ] as const
            ).map((filter) => (
              <button
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                  statusFilter === filter.key
                    ? "bg-accent text-white"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Location Select */}
          {locations.length > 1 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-8 rounded-lg border border-line bg-surface-card px-2.5 text-xs text-ink-primary focus:border-accent focus:outline-none"
            >
              <option value="ALL">All Branches</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Team Table */}
      <Card>
        {teamQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-page" />
            ))}
          </div>
        ) : teamQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(teamQuery.error, "Unable to load team members.")}
              onRetry={() => teamQuery.refetch()}
            />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title={searchQuery || statusFilter !== "ALL" ? "No matching team members" : "No team members added yet"}
              description={
                searchQuery || statusFilter !== "ALL"
                  ? "Try adjusting your search or filter settings to find staff."
                  : "Add your staff members so they can log in, manage sales, and serve customers according to their role."
              }
            />
            {team.length === 0 && (
              <div className="mt-4 flex justify-center">
                <Button onClick={() => setIsAddModalOpen(true)}>+ Add First Team Member</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted bg-surface-page/30">
                <tr>
                  <th className="px-5 py-3 font-medium">Team Member</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Access Level</th>
                  <th className="px-5 py-3 font-medium">Branch / Location</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredMembers.map((member) => {
                  const isOwner = member.role === "OWNER";
                  return (
                    <tr
                      key={member.id}
                      onClick={() => setSelectedMemberId(member.id)}
                      className="group cursor-pointer hover:bg-surface-page/60 transition-colors"
                    >
                      {/* Name & Contact */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent font-semibold text-xs group-hover:bg-accent group-hover:text-white transition-colors">
                            {member.user.firstName?.[0]}
                            {member.user.lastName?.[0]}
                          </div>
                          <div>
                            <div className="font-medium text-ink-primary flex items-center gap-1.5">
                              {member.user.firstName} {member.user.lastName}
                              {isOwner && (
                                <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.2 text-[10px] font-semibold text-accent" title="Primary Business Owner">
                                  <Shield className="h-3 w-3" /> Owner
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-ink-muted">{member.user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center rounded-md bg-surface-page px-2 py-1 text-xs font-medium text-ink-primary border border-line">
                          {member.jobTitle || member.businessRole || member.role}
                        </span>
                      </td>

                      {/* Access Level */}
                      <td className="px-5 py-3.5 text-xs text-ink-secondary">
                        <span className="font-medium">{member.accessLevel || "Standard Access"}</span>
                      </td>

                      {/* Location */}
                      <td className="px-5 py-3.5 text-xs text-ink-secondary">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                          <span>
                            {member.allLocations
                              ? "All Locations"
                              : member.locations && member.locations.length > 0
                              ? member.locations.map((l) => l.name).join(", ")
                              : "Assigned Branch"}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            member.status === "ACTIVE"
                              ? "bg-status-success/15 text-status-success"
                              : member.status === "INVITED"
                              ? "bg-status-warning/15 text-status-warning"
                              : "bg-status-critical/15 text-status-critical"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              member.status === "ACTIVE"
                                ? "bg-status-success"
                                : member.status === "INVITED"
                                ? "bg-status-warning"
                                : "bg-status-critical"
                            }`}
                          />
                          {member.status === "ACTIVE"
                            ? "Active"
                            : member.status === "INVITED"
                            ? "Pending"
                            : "Disabled"}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
                          View Profile <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Team Member Modal */}
      <TeamMemberModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

      {/* Team Member Profile Drawer */}
      <TeamMemberProfile memberId={selectedMemberId} onClose={() => setSelectedMemberId(null)} />
    </div>
  );
}
