"use client";

import { useState, type FormEvent } from "react";

import { useCreateIntegration, useSetIntegrationCredentials } from "@/lib/hooks/use-integrations";
import type { CredentialType, IntegrationType } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const INTEGRATION_TYPES: IntegrationType[] = ["STANDARD_API", "REST_API", "WEBHOOK", "N8N"];
const CREDENTIAL_TYPES: CredentialType[] = ["API_KEY", "OAUTH2", "BASIC_AUTH", "BEARER_TOKEN"];

export function ConnectIntegrationForm({ onDone }: { onDone: () => void }) {
  const createIntegration = useCreateIntegration();
  const setCredentials = useSetIntegrationCredentials();

  const [name, setName] = useState("");
  const [type, setType] = useState<IntegrationType>("REST_API");
  const [baseUrl, setBaseUrl] = useState("");
  const [credentialType, setCredentialType] = useState<CredentialType>("API_KEY");
  const [credentialPayload, setCredentialPayload] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = createIntegration.isPending || setCredentials.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    let payload: Record<string, unknown> = {};
    if (credentialPayload.trim()) {
      try {
        payload = JSON.parse(credentialPayload);
      } catch {
        setError("Credential payload must be valid JSON.");
        return;
      }
    }

    try {
      const integration = await createIntegration.mutateAsync({
        name,
        type,
        baseUrl: baseUrl || undefined,
      });

      if (Object.keys(payload).length > 0) {
        await setCredentials.mutateAsync({ integrationId: integration.id, type: credentialType, payload });
      }

      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Could not connect the integration."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-line bg-surface-page p-4">
      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Booking system" required />

      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as IntegrationType)}>
          {INTEGRATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input
          label="Base URL"
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Credential type"
          value={credentialType}
          onChange={(e) => setCredentialType(e.target.value as CredentialType)}
        >
          {CREDENTIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Textarea
          label="Credential payload (JSON)"
          value={credentialPayload}
          onChange={(e) => setCredentialPayload(e.target.value)}
          rows={2}
          hint='e.g. { "apiKey": "..." }'
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" isLoading={isSubmitting}>
          Connect
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
