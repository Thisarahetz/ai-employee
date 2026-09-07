"use client";

import { useState } from "react";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { useInviteMember, useRoleTemplates } from "@/lib/hooks/use-team";
import { getErrorMessage } from "@/lib/utils";
import type { BusinessRoleTemplateInfo, InviteMemberResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Check, Shield, User, MapPin, Sparkles, Key, AlertCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TeamMemberModal({ isOpen, onClose }: Props) {
  const roleTemplatesQuery = useRoleTemplates();
  const locationsQuery = useBusinesses();
  const inviteMember = useInviteMember();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("sales");
  const [accessLevel, setAccessLevel] = useState<string>("STANDARD");
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);

  const [allLocations, setAllLocations] = useState<boolean>(true);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

  const [result, setResult] = useState<InviteMemberResult | null>(null);

  if (!isOpen) return null;

  const templates = roleTemplatesQuery.data?.templates || [];
  const categories = roleTemplatesQuery.data?.categories || [];
  const locations = locationsQuery.data || [];

  const selectedTemplate = templates.find((t) => t.key === selectedRoleKey) || templates[0];

  function handleRoleChange(key: string) {
    setSelectedRoleKey(key);
    const tmpl = templates.find((t) => t.key === key);
    if (tmpl) {
      setAccessLevel(tmpl.accessLevel);
      setCustomPermissions(tmpl.defaultPermissions);
    }
  }

  function handlePermissionToggle(permId: string) {
    setCustomPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId],
    );
  }

  function handleLocationToggle(locId: string) {
    setSelectedLocationIds((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId],
    );
  }

  async function handleFinish() {
    setError(null);
    try {
      const role = selectedTemplate?.baseRole === "ADMIN" ? "ADMIN" : selectedTemplate?.baseRole === "MANAGER" ? "MANAGER" : "EMPLOYEE";
      const res = await inviteMember.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
        businessRole: selectedTemplate?.name || "Staff Member",
        jobTitle: selectedTemplate?.name || "Staff Member",
        accessLevel,
        permissions: accessLevel === "CUSTOM" ? customPermissions : undefined,
        allLocations,
        locationIds: allLocations ? [] : selectedLocationIds,
      });

      setResult(res);
    } catch (err) {
      setError(getErrorMessage(err, "Could not add this team member. Please try again."));
    }
  }

  function handleResetAndClose() {
    setStep(1);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-surface-card shadow-2xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="border-b border-line bg-surface-page/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink-primary">Add Team Member</h2>
              <p className="text-xs text-ink-secondary">
                Add an employee to your business and decide what they can access.
              </p>
            </div>
            {!result && (
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                Step {step} of 4
              </span>
            )}
          </div>

          {/* Stepper indicators */}
          {!result && (
            <div className="mt-4 flex items-center gap-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    s === step ? "bg-accent" : s < step ? "bg-accent/40" : "bg-line"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-status-critical/10 p-3 text-sm text-status-critical">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result ? (
            /* Success screen */
            <div className="space-y-5 py-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-success/15 text-status-success">
                <Check className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink-primary">
                  {result.membership.user.firstName} {result.membership.user.lastName} Added!
                </h3>
                <p className="mt-1 text-sm text-ink-secondary">
                  Assigned as <strong className="text-ink-primary">{result.membership.jobTitle || result.membership.role}</strong>
                </p>
              </div>

              {result.temporaryPassword ? (
                <div className="rounded-lg border border-accent/20 bg-accent-soft/30 p-4 text-left">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                    <Key className="h-4 w-4" />
                    One-Time Login Credentials
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Share this temporary password with the employee. It will not be shown again.
                  </p>
                  <div className="mt-3 flex items-center justify-between rounded bg-surface-card p-2.5 font-mono text-sm border border-line">
                    <span>
                      <strong className="text-ink-secondary">Email:</strong> {result.membership.user.email}
                    </span>
                    <span>
                      <strong className="text-ink-secondary">Password:</strong> {result.temporaryPassword}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-surface-page p-3 text-sm text-ink-secondary">
                  This user already had an existing account and can log in with their existing credentials.
                </div>
              )}

              <Button className="w-full" onClick={handleResetAndClose}>
                Done & Return to Team
              </Button>
            </div>
          ) : step === 1 ? (
            /* Step 1: Employee Information */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  placeholder="e.g. Nimal"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <Input
                  label="Last Name"
                  placeholder="e.g. Perera"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>

              <Input
                label="Email Address"
                type="email"
                placeholder="nimal@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Phone Number (Optional)"
                type="tel"
                placeholder="+94 77 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <div className="rounded-lg border border-line bg-surface-page/50 p-3 text-xs text-ink-secondary">
                <p className="font-medium text-ink-primary">What happens next?</p>
                <p className="mt-0.5">
                  The employee will receive an account to access the platform. You control what branch and business features they can use.
                </p>
              </div>
            </div>
          ) : step === 2 ? (
            /* Step 2: Role & Access Level */
            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold text-ink-primary">Select Predefined Role</label>
                <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {templates.map((t) => (
                    <button
                      type="button"
                      key={t.key}
                      onClick={() => handleRoleChange(t.key)}
                      className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                        selectedRoleKey === t.key
                          ? "border-accent bg-accent-soft/30 shadow-xs"
                          : "border-line bg-surface-card hover:bg-surface-page"
                      }`}
                    >
                      <span className="font-medium text-xs text-ink-primary">{t.name}</span>
                      <span className="mt-1 text-[11px] text-ink-muted line-clamp-2">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-primary">Access Level Preset</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { key: "FULL", label: "Full Access", desc: "All features" },
                    { key: "MANAGER", label: "Manager Access", desc: "Operations & team" },
                    { key: "STANDARD", label: "Standard Access", desc: "Daily sales & stock" },
                    { key: "LIMITED", label: "Limited Access", desc: "Billing counter only" },
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.key}
                      onClick={() => {
                        setAccessLevel(preset.key);
                        const tmpl = templates.find((t) => t.key === selectedRoleKey);
                        if (tmpl) setCustomPermissions(tmpl.defaultPermissions);
                      }}
                      className={`rounded-lg border p-2.5 text-left text-xs transition-all ${
                        accessLevel === preset.key
                          ? "border-accent bg-accent-soft/20 text-accent font-semibold"
                          : "border-line text-ink-secondary hover:bg-surface-page"
                      }`}
                    >
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-[10px] text-ink-muted">{preset.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setAccessLevel("CUSTOM")}
                    className={`text-xs font-medium ${
                      accessLevel === "CUSTOM" ? "text-accent underline" : "text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    {accessLevel === "CUSTOM" ? "● Custom Permissions Selected" : "Customize specific permissions..."}
                  </button>
                </div>
              </div>

              {/* Granular Permission Checklist if Custom */}
              {accessLevel === "CUSTOM" && (
                <div className="rounded-lg border border-line bg-surface-page/40 p-3.5 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                    Fine-Grained Permissions
                  </h4>
                  {categories.map((cat) => (
                    <div key={cat.id} className="space-y-1.5 border-t border-line/60 pt-2 first:border-0 first:pt-0">
                      <div className="text-xs font-medium text-ink-primary">{cat.name}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {cat.permissions.map((p) => {
                          const isChecked = customPermissions.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-center gap-2 rounded p-1 hover:bg-surface-card cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handlePermissionToggle(p.id)}
                                className="rounded border-line text-accent focus:ring-accent"
                              />
                              <span className="text-ink-secondary">{p.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : step === 3 ? (
            /* Step 3: Branch / Location Access */
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-primary">Where does this employee work?</label>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-3 rounded-lg border border-line p-3 cursor-pointer hover:bg-surface-page">
                    <input
                      type="radio"
                      name="locationRadio"
                      checked={allLocations}
                      onChange={() => setAllLocations(true)}
                      className="text-accent focus:ring-accent"
                    />
                    <div>
                      <div className="text-xs font-medium text-ink-primary">All Branches / Locations</div>
                      <div className="text-[11px] text-ink-muted">
                        Employee can access and serve all current and future branches.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border border-line p-3 cursor-pointer hover:bg-surface-page">
                    <input
                      type="radio"
                      name="locationRadio"
                      checked={!allLocations}
                      onChange={() => setAllLocations(false)}
                      className="text-accent focus:ring-accent"
                    />
                    <div>
                      <div className="text-xs font-medium text-ink-primary">Specific Branches Only</div>
                      <div className="text-[11px] text-ink-muted">
                        Employee is restricted to selected locations only.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {!allLocations && (
                <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface-page/40 p-3">
                  <p className="text-xs font-semibold text-ink-primary">Select Assigned Branches</p>
                  {locations.length === 0 ? (
                    <p className="text-xs text-ink-muted">No additional branches configured yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {locations.map((loc) => {
                        const checked = selectedLocationIds.includes(loc.id);
                        return (
                          <label
                            key={loc.id}
                            className="flex items-center gap-2.5 rounded p-2 hover:bg-surface-card cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleLocationToggle(loc.id)}
                              className="rounded border-line text-accent focus:ring-accent"
                            />
                            <MapPin className="h-3.5 w-3.5 text-ink-muted" />
                            <span className="font-medium text-ink-primary">{loc.name}</span>
                            <span className="text-[10px] text-ink-muted capitalize">({loc.type.toLowerCase()})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Step 4: Review & Send */
            <div className="space-y-4">
              <div className="rounded-lg border border-line bg-surface-page/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Review Employee Details
                </h3>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-ink-muted">Name:</span>
                    <p className="font-medium text-ink-primary">{firstName} {lastName}</p>
                  </div>
                  <div>
                    <span className="text-ink-muted">Email:</span>
                    <p className="font-medium text-ink-primary">{email}</p>
                  </div>
                  {phone && (
                    <div>
                      <span className="text-ink-muted">Phone:</span>
                      <p className="font-medium text-ink-primary">{phone}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-ink-muted">Assigned Role:</span>
                    <p className="font-medium text-accent">{selectedTemplate?.name}</p>
                  </div>
                  <div>
                    <span className="text-ink-muted">Access Level:</span>
                    <p className="font-medium text-ink-primary">{accessLevel}</p>
                  </div>
                  <div>
                    <span className="text-ink-muted">Branch Access:</span>
                    <p className="font-medium text-ink-primary">
                      {allLocations
                        ? "All Locations"
                        : `${selectedLocationIds.length} Selected Branch(es)`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-status-success/10 p-3 text-xs text-ink-secondary flex items-start gap-2">
                <Shield className="h-4 w-4 text-status-success shrink-0 mt-0.5" />
                <span>
                  This user will only have access to authorized features and will not be able to modify ownership or critical company settings.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {!result && (
          <div className="flex items-center justify-between border-t border-line bg-surface-page/30 px-6 py-4">
            {step === 1 ? (
              <Button variant="ghost" size="sm" onClick={handleResetAndClose}>
                Cancel
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setStep((s) => (s - 1) as any)}>
                Back
              </Button>
            )}

            {step < 4 ? (
              <Button
                size="sm"
                onClick={() => {
                  if (step === 1) {
                    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
                      setError("First name, last name, and email are required.");
                      return;
                    }
                    setError(null);
                  }
                  setStep((s) => (s + 1) as any);
                }}
              >
                Continue
              </Button>
            ) : (
              <Button size="sm" isLoading={inviteMember.isPending} onClick={handleFinish}>
                Add Team Member
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
