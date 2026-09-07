"use client";

import { useState } from "react";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import {
  useCancelInvite,
  useRemoveMember,
  useResendInvite,
  useRoleTemplates,
  useTeamMemberDetail,
  useUpdateMember,
} from "@/lib/hooks/use-team";
import { getErrorMessage } from "@/lib/utils";
import type { TenantMembership, TenantRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Shield,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  X,
  Edit2,
  Key,
} from "lucide-react";

interface Props {
  memberId: string | null;
  onClose: () => void;
}

export function TeamMemberProfile({ memberId, onClose }: Props) {
  const memberQuery = useTeamMemberDetail(memberId);
  const roleTemplatesQuery = useRoleTemplates();
  const locationsQuery = useBusinesses();

  const updateMember = useUpdateMember();
  const resendInvite = useResendInvite();
  const cancelInvite = useCancelInvite();
  const removeMember = useRemoveMember();

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Edit fields
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editRole, setEditRole] = useState<TenantRole>("EMPLOYEE");
  const [editAccessLevel, setEditAccessLevel] = useState("STANDARD");
  const [editAllLocations, setEditAllLocations] = useState(true);
  const [editLocationIds, setEditLocationIds] = useState<string[]>([]);

  if (!memberId) return null;

  const member = memberQuery.data;
  const isOwner = member?.role === "OWNER";
  const templates = roleTemplatesQuery.data?.templates || [];
  const locations = locationsQuery.data || [];

  function startEditing() {
    if (!member) return;
    setEditFirstName(member.user.firstName);
    setEditLastName(member.user.lastName);
    setEditPhone(member.user.phone || "");
    setEditJobTitle(member.jobTitle || member.businessRole || member.role);
    setEditRole(member.role);
    setEditAccessLevel(member.accessLevel || "STANDARD");
    setEditAllLocations(member.allLocations ?? true);
    setEditLocationIds(member.locationIds || []);
    setIsEditing(true);
    setError(null);
  }

  async function handleSaveEdit() {
    if (!member) return;
    setError(null);
    try {
      await updateMember.mutateAsync({
        id: member.id,
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        phone: editPhone.trim() || undefined,
        jobTitle: editJobTitle.trim(),
        role: editRole,
        accessLevel: editAccessLevel,
        allLocations: editAllLocations,
        locationIds: editAllLocations ? [] : editLocationIds,
      });
      setIsEditing(false);
      setSuccessMsg("Team member updated successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save changes."));
    }
  }

  async function handleToggleStatus() {
    if (!member) return;
    setError(null);
    try {
      const nextStatus = member.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      await updateMember.mutateAsync({
        id: member.id,
        status: nextStatus,
      });
      setSuccessMsg(
        nextStatus === "DISABLED" ? "User disabled. They can no longer log in." : "User reactivated successfully.",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to change status."));
    }
  }

  async function handleResend() {
    if (!member) return;
    setError(null);
    try {
      const res = await resendInvite.mutateAsync(member.id);
      if (res.temporaryPassword) {
        setTempPassword(res.temporaryPassword);
      }
      setSuccessMsg("Invitation refreshed and credentials updated.");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to resend invitation."));
    }
  }

  async function handleCancel() {
    if (!member) return;
    if (!confirm("Are you sure you want to cancel this pending invitation?")) return;
    setError(null);
    try {
      await cancelInvite.mutateAsync(member.id);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to cancel invitation."));
    }
  }

  async function handleRemove() {
    if (!member) return;
    if (!confirm("Are you sure you want to remove this team member? Historical transactions will remain.")) return;
    setError(null);
    try {
      await removeMember.mutateAsync(member.id);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to remove member."));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
      <div className="h-full w-full max-w-lg border-l border-line bg-surface-card shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white font-semibold text-sm">
              {member?.user.firstName?.[0]}
              {member?.user.lastName?.[0]}
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-primary">
                {member?.user.firstName} {member?.user.lastName}
              </h2>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <span>{member?.jobTitle || member?.businessRole || member?.role}</span>
                <span>•</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    member?.status === "ACTIVE"
                      ? "bg-status-success/15 text-status-success"
                      : member?.status === "INVITED"
                      ? "bg-status-warning/15 text-status-warning"
                      : "bg-status-critical/15 text-status-critical"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      member?.status === "ACTIVE"
                        ? "bg-status-success"
                        : member?.status === "INVITED"
                        ? "bg-status-warning"
                        : "bg-status-critical"
                    }`}
                  />
                  {member?.status === "ACTIVE" ? "Active" : member?.status === "INVITED" ? "Pending Invite" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-page hover:text-ink-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-lg bg-status-critical/10 p-3 text-xs text-status-critical flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg bg-status-success/10 p-3 text-xs text-status-success flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {tempPassword && (
            <div className="rounded-lg border border-accent/20 bg-accent-soft/30 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-accent">
                <Key className="h-4 w-4" /> New Temporary Password
              </div>
              <p className="font-mono text-sm font-medium text-ink-primary select-all">{tempPassword}</p>
              <p className="text-[11px] text-ink-muted">Share this password with the employee.</p>
            </div>
          )}

          {isOwner && (
            <div className="flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent-soft/20 p-3 text-xs text-ink-secondary">
              <Shield className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-ink-primary">Primary Business Owner</p>
                <p className="mt-0.5">
                  This account holds full control of the workspace. For business safety, owner accounts cannot be deleted or disabled by staff.
                </p>
              </div>
            </div>
          )}

          {/* Edit Form Mode */}
          {isEditing ? (
            <div className="space-y-4 rounded-xl border border-line bg-surface-page/40 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Edit Information</h3>
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="First Name"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                />
                <Input
                  label="Last Name"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                />
              </div>

              <Input
                label="Phone Number"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+94 77 123 4567"
              />

              <Input
                label="Job Title / Role Name"
                value={editJobTitle}
                onChange={(e) => setEditJobTitle(e.target.value)}
                placeholder="e.g. Senior Cashier"
              />

              <div>
                <label className="text-xs font-medium text-ink-secondary">Access Level Preset</label>
                <Select
                  value={editAccessLevel}
                  onChange={(e) => setEditAccessLevel(e.target.value)}
                  className="mt-1"
                >
                  <option value="FULL">Full Access</option>
                  <option value="MANAGER">Manager Access</option>
                  <option value="STANDARD">Standard Access</option>
                  <option value="LIMITED">Limited Access</option>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-ink-secondary">Branch Access</label>
                <div className="mt-1.5 space-y-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      checked={editAllLocations}
                      onChange={() => setEditAllLocations(true)}
                      className="text-accent"
                    />
                    <span>All Locations</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      checked={!editAllLocations}
                      onChange={() => setEditAllLocations(false)}
                      className="text-accent"
                    />
                    <span>Specific Branches Only</span>
                  </label>
                </div>
              </div>

              {!editAllLocations && (
                <div className="space-y-1 rounded border border-line bg-surface-card p-2 text-xs">
                  {locations.map((loc) => (
                    <label key={loc.id} className="flex items-center gap-2 cursor-pointer p-1">
                      <input
                        type="checkbox"
                        checked={editLocationIds.includes(loc.id)}
                        onChange={() =>
                          setEditLocationIds((prev) =>
                            prev.includes(loc.id) ? prev.filter((id) => id !== loc.id) : [...prev, loc.id],
                          )
                        }
                        className="rounded border-line text-accent"
                      />
                      <span>{loc.name}</span>
                    </label>
                  ))}
                </div>
              )}

              <Button
                className="w-full"
                size="sm"
                isLoading={updateMember.isPending}
                onClick={handleSaveEdit}
              >
                Save Changes
              </Button>
            </div>
          ) : (
            /* View Details Mode */
            <div className="space-y-6">
              {/* Contact Information */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Contact Details</h3>
                <div className="mt-2.5 space-y-2 rounded-lg border border-line p-3 text-xs">
                  <div className="flex items-center gap-2 text-ink-primary">
                    <Mail className="h-4 w-4 text-ink-muted" />
                    <span>{member?.user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-ink-primary">
                    <Phone className="h-4 w-4 text-ink-muted" />
                    <span>{member?.user.phone || "No phone number added"}</span>
                  </div>
                </div>
              </div>

              {/* Access & Branch Permissions */}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Access & Branch</h3>
                  {!isOwner && (
                    <button
                      onClick={startEditing}
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </button>
                  )}
                </div>
                <div className="mt-2.5 space-y-2 rounded-lg border border-line p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Access Level:</span>
                    <span className="font-medium text-ink-primary">{member?.accessLevel || "Standard Access"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Branch / Location:</span>
                    <span className="font-medium text-ink-primary">
                      {member?.allLocations
                        ? "All Locations"
                        : member?.locations?.length
                        ? member.locations.map((l) => l.name).join(", ")
                        : "No branches assigned"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Account Timestamps */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Account Activity</h3>
                <div className="mt-2.5 space-y-2 rounded-lg border border-line p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <Calendar className="h-3.5 w-3.5" /> Added On:
                    </span>
                    <span className="text-ink-primary">
                      {member?.createdAt ? new Date(member.createdAt).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <Clock className="h-3.5 w-3.5" /> Last Login:
                    </span>
                    <span className="text-ink-primary">
                      {member?.user.lastLoginAt ? new Date(member.user.lastLoginAt).toLocaleString() : "Never logged in"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Activity Log */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Recent Operational Activity
                </h3>
                <div className="mt-2.5 space-y-2">
                  {member?.recentActivity && member.recentActivity.length > 0 ? (
                    member.recentActivity.map((act) => (
                      <div key={act.id} className="rounded-lg border border-line/60 bg-surface-page/30 p-2.5 text-xs">
                        <div className="font-medium text-ink-primary">
                          {(act.changes as any)?.summary || act.action.replace(/_/g, " ")}
                        </div>
                        <div className="mt-0.5 text-[10px] text-ink-muted">
                          {new Date(act.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-line/50 p-3 text-center text-xs text-ink-muted">
                      No operational activity recorded yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isOwner && (
          <div className="border-t border-line bg-surface-page/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              {member?.status === "INVITED" ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    isLoading={resendInvite.isPending}
                    onClick={handleResend}
                  >
                    Resend Invite
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="flex-1"
                    isLoading={cancelInvite.isPending}
                    onClick={handleCancel}
                  >
                    Cancel Invite
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={member?.status === "ACTIVE" ? "secondary" : "primary"}
                    size="sm"
                    className="flex-1"
                    isLoading={updateMember.isPending}
                    onClick={handleToggleStatus}
                  >
                    {member?.status === "ACTIVE" ? "Disable User" : "Reactivate User"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-status-critical hover:bg-status-critical/10"
                    isLoading={removeMember.isPending}
                    onClick={handleRemove}
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
