"use client";

import { useState, type FormEvent } from "react";

import { useCreateTenant } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import type { CreateTenantResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CreateTenantForm({ onDone }: { onDone: () => void }) {
  const createTenant = useCreateTenant();

  const [tenantName, setTenantName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTenantResult | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!tenantName.trim() || !ownerEmail.trim() || !ownerFirstName.trim() || !ownerLastName.trim()) {
      setError("All fields are required.");
      return;
    }

    try {
      const created = await createTenant.mutateAsync({ tenantName, ownerEmail, ownerFirstName, ownerLastName });
      setResult(created);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to create tenant."));
    }
  }

  // Show the one-time generated password instead of the form until dismissed —
  // it's never retrievable again after this render.
  if (result) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium text-ink-primary">
            &ldquo;{result.tenant.name}&rdquo; created — share these credentials with {result.owner.email}:
          </p>
          {result.temporaryPassword && (
            <p className="rounded-md bg-surface-page px-3 py-2 font-mono text-sm text-ink-primary">
              {result.owner.email} / {result.temporaryPassword}
            </p>
          )}
          <p className="text-xs text-ink-muted">This password is shown once and cannot be retrieved again.</p>
          <Button
            onClick={() => {
              setResult(null);
              setTenantName("");
              setOwnerEmail("");
              setOwnerFirstName("");
              setOwnerLastName("");
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
        <Input label="Tenant name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Owner first name"
            value={ownerFirstName}
            onChange={(e) => setOwnerFirstName(e.target.value)}
            required
          />
          <Input
            label="Owner last name"
            value={ownerLastName}
            onChange={(e) => setOwnerLastName(e.target.value)}
            required
          />
        </div>
        <Input
          label="Owner email"
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          required
        />
        <p className="text-xs text-ink-muted">A temporary password is generated and shown once after creation.</p>
        <Button type="submit" isLoading={createTenant.isPending}>
          Create tenant
        </Button>
      </form>
    </Card>
  );
}
