"use client";

import { useState, type FormEvent } from "react";

import { useInviteMember } from "@/lib/hooks/use-team";
import { getErrorMessage } from "@/lib/utils";
import type { InviteMemberInput, InviteMemberResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const INVITABLE_ROLES: InviteMemberInput["role"][] = ["ADMIN", "MANAGER", "EMPLOYEE"];

export function InviteMemberForm({ onDone }: { onDone: () => void }) {
  const inviteMember = useInviteMember();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<InviteMemberInput["role"]>("EMPLOYEE");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteMemberResult | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      setError("All fields are required.");
      return;
    }

    try {
      const invited = await inviteMember.mutateAsync({ email, firstName, lastName, role });
      setResult(invited);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to invite this person."));
    }
  }

  // Show the one-time generated password (new accounts only) until dismissed.
  if (result) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium text-ink-primary">
            {result.membership.user.firstName} {result.membership.user.lastName} added as {result.membership.role}.
          </p>
          {result.temporaryPassword && (
            <>
              <p className="rounded-md bg-surface-page px-3 py-2 font-mono text-sm text-ink-primary">
                {result.membership.user.email} / {result.temporaryPassword}
              </p>
              <p className="text-xs text-ink-muted">This password is shown once and cannot be retrieved again.</p>
            </>
          )}
          <Button
            onClick={() => {
              setResult(null);
              setEmail("");
              setFirstName("");
              setLastName("");
              onDone();
            }}
          >
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {error && (
          <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as InviteMemberInput["role"])}>
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <p className="text-xs text-ink-muted">
          If they don&apos;t already have an AI Employee account, a temporary password is generated and shown once.
        </p>
        <Button type="submit" isLoading={inviteMember.isPending}>
          Send invite
        </Button>
      </form>
    </Card>
  );
}
