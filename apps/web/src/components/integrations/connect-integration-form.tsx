"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Circle, Code2, KeyRound, Loader2 } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import {
  useCreateDeveloperKit,
  useCreateIntegration,
  useIntegrationsLive,
  useSetIntegrationCredentials,
  useTestIntegration,
  useUpdateIntegration,
} from "@/lib/hooks/use-integrations";
import type { IntegrationTestResult } from "@/lib/types";
import type { DeveloperKit } from "@/lib/developer-guide";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CopyField } from "@/components/channels/copy-field";
import { DeveloperKitPanel } from "@/components/integrations/developer-kit-panel";

type Path = "developer" | "details";

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-label="Done" />
      ) : (
        <Circle className={`mt-0.5 h-5 w-5 shrink-0 ${active ? "text-brand-600" : "text-ink-muted"}`} aria-label="Not done yet" />
      )}
      <div className="min-w-0 flex-1 space-y-3">
        <p className={`text-sm font-semibold ${active || done ? "text-ink-primary" : "text-ink-muted"}`}>
          {n}. {title}
        </p>
        {active && children}
      </div>
    </li>
  );
}

function PathCard({ icon, title, text, onClick, badge }: { icon: ReactNode; title: string; text: string; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 gap-3 rounded-lg border border-line bg-white p-4 text-left hover:border-brand-600 hover:bg-brand-50"
    >
      <span className="mt-0.5 text-brand-600">{icon}</span>
      <span>
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          {title}
          {badge && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">{badge}</span>}
        </span>
        <span className="mt-1 block text-sm text-ink-secondary">{text}</span>
      </span>
    </button>
  );
}

/** Shared last part of both paths: test the address, then wait for a real event. */
function useConnectionChecks(integrationId: string | null) {
  const test = useTestIntegration("");
  const [result, setResult] = useState<IntegrationTestResult | null>(null);
  const [since, setSince] = useState(0);
  const connected = Boolean(result?.ok);
  const live = useIntegrationsLive(connected);
  const current = live.data?.find((i) => i.id === integrationId);
  const eventArrived = Boolean(current?.lastEventAt && new Date(current.lastEventAt).getTime() >= since);
  async function run(id: string) {
    const r = await test.mutateAsync(id);
    setResult(r);
    if (r.ok) setSince(Date.now() - 5000);
    return r;
  }
  return { run, result, connected, eventArrived, current, isTesting: test.isPending };
}

function WaitingForEvent({ name }: { name: string }) {
  return (
    <>
      <p className="text-sm text-ink-secondary">
        Last check: when {name} reports its first event (for example a new booking, or the test event from the
        developer&apos;s <span className="font-mono">verify</span> command), this step ticks. You can close this
        window; the integration card shows the status.
      </p>
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Waiting for the first event…
      </p>
    </>
  );
}

function ConnectedNote({ name, type, at, onDone }: { name: string; type?: string | null; at?: string | null; onDone: () => void }) {
  return (
    <>
      <p className="text-sm text-ink-secondary">
        Received <span className="font-mono">{type}</span>
        {at ? ` at ${formatDateTime(at)}` : ""}. AI employees can now use {name}&apos;s actions, answer from its
        information, and react to its events in Automations.
      </p>
      <Button size="sm" onClick={onDone}>
        Done
      </Button>
    </>
  );
}

/** Owner path: AI Employee makes the keys; a developer builds; the owner tests. */
function DeveloperPath({ onDone }: { onDone: () => void }) {
  const createKit = useCreateDeveloperKit();
  const update = useUpdateIntegration();
  const [name, setName] = useState("");
  const [kit, setKit] = useState<(DeveloperKit & { id: string }) | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const checks = useConnectionChecks(kit?.id ?? null);

  async function makeKit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await createKit.mutateAsync(name.trim());
      setKit({ id: r.integration.id, name: r.integration.name, apiKey: r.apiKey, webhookUrl: r.webhookUrl, webhookSecret: r.webhookSecret });
    } catch (err) {
      setError(getErrorMessage(err, "Could not create the keys."));
    }
  }

  async function testAddress(e: FormEvent) {
    e.preventDefault();
    if (!kit) return;
    setError(null);
    try {
      const url = baseUrl.trim().replace(/\/+$/, "").replace(/\/ai(\/actions)?$/, "");
      await update.mutateAsync({ id: kit.id, baseUrl: url });
      const r = await checks.run(kit.id);
      if (!r.ok) setError(r.message);
    } catch (err) {
      setError(getErrorMessage(err, "Could not test the connection."));
    }
  }

  return (
    <ol className="space-y-6">
      <Step n={1} title="Name the software you want to connect" done={Boolean(kit)} active={!kit}>
        <form onSubmit={makeKit} className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Booking system" required />
          {error && <p className="text-sm text-status-critical">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" isLoading={createKit.isPending}>
              Create keys
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </Step>

      <Step n={2} title="Send the developer kit to your developer" done={checks.connected} active={Boolean(kit) && !checks.connected}>
        {kit && <DeveloperKitPanel kit={kit} />}
      </Step>

      <Step n={3} title="Paste the Base URL your developer sends back" done={checks.connected} active={Boolean(kit) && !checks.connected}>
        <form onSubmit={testAddress} className="space-y-3">
          <Input
            label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.yourapp.com"
            hint="Your developer gives you this when their part is done. You can also add it later on the integration card."
            required
          />
          {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}
          <Button type="submit" size="sm" variant="secondary" isLoading={checks.isTesting || update.isPending}>
            Test connection
          </Button>
        </form>
      </Step>

      <Step n={4} title="Connected" done={checks.eventArrived} active={checks.connected}>
        <p className="text-sm text-emerald-700">{checks.result?.message}</p>
        {checks.eventArrived ? (
          <ConnectedNote name={kit?.name ?? ""} type={checks.current?.lastEventType} at={checks.current?.lastEventAt} onDone={onDone} />
        ) : (
          <WaitingForEvent name={kit?.name ?? "the software"} />
        )}
      </Step>
    </ol>
  );
}

/** For software that already supports AI Employee: paste its address and key. */
function DetailsPath({ onDone }: { onDone: () => void }) {
  const createIntegration = useCreateIntegration();
  const setCredentials = useSetIntegrationCredentials();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [auth, setAuth] = useState<"header" | "bearer">("header");
  const [headerName, setHeaderName] = useState("X-API-Key");
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [webhook, setWebhook] = useState<{ url: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checks = useConnectionChecks(integrationId);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const url = baseUrl.trim().replace(/\/+$/, "").replace(/\/ai(\/actions)?$/, "");
      const config = auth === "header" ? { apiKeyHeader: headerName.trim() || "X-API-Key" } : {};
      let id = integrationId;
      if (!id) {
        const created = await createIntegration.mutateAsync({ name: name.trim(), type: "STANDARD_API", baseUrl: url, config });
        id = created.id;
        setIntegrationId(id);
        setWebhook({ url: created.webhookUrl, secret: created.webhookSecret });
      } else {
        await apiClient.patch(`/integrations/${id}`, { name: name.trim(), baseUrl: url, config });
      }
      await setCredentials.mutateAsync({
        integrationId: id,
        type: auth === "header" ? "API_KEY" : "BEARER_TOKEN",
        payload: auth === "header" ? { apiKey: apiKey.trim() } : { token: apiKey.trim() },
      });
      const r = await checks.run(id);
      if (!r.ok) setError(r.message);
    } catch (err) {
      setError(getErrorMessage(err, "Could not connect."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ol className="space-y-6">
      <Step n={1} title="Enter the connection details and test" done={checks.connected} active={!checks.connected}>
        <form onSubmit={connect} className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Booking system" required />
          <Input
            label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            hint="The address where the software answers /ai/actions, without /ai/actions at the end."
            required
          />
          <Input label="API key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="How the key is sent" value={auth} onChange={(e) => setAuth(e.target.value as "header" | "bearer")}>
              <option value="header">In a header</option>
              <option value="bearer">As a Bearer token</option>
            </Select>
            {auth === "header" && <Input label="Header name" value={headerName} onChange={(e) => setHeaderName(e.target.value)} />}
          </div>
          {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" isLoading={busy}>
              {integrationId ? "Save and test again" : "Connect and test"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </Step>

      <Step n={2} title="Give the software the webhook details" done={checks.eventArrived} active={checks.connected && !checks.eventArrived}>
        <p className="text-sm text-emerald-700">{checks.result?.message}</p>
        <p className="text-sm text-ink-secondary">These let the software tell AI Employee when things happen. The secret is shown only once.</p>
        {webhook && (
          <>
            <CopyField label="Webhook URL" value={webhook.url} />
            <CopyField label="Webhook secret" value={webhook.secret} />
          </>
        )}
        <WaitingForEvent name={name || "the software"} />
      </Step>

      <Step n={3} title="Connected" done={checks.eventArrived} active={checks.eventArrived}>
        <ConnectedNote name={name} type={checks.current?.lastEventType} at={checks.current?.lastEventAt} onDone={onDone} />
      </Step>
    </ol>
  );
}

/**
 * "Connect a business system". Most owners hand the work to a developer, so the
 * default path creates the keys and a ready developer kit; owners whose software
 * already supports AI Employee just paste its details.
 */
export function ConnectIntegrationForm({ onDone }: { onDone: () => void }) {
  const [path, setPath] = useState<Path | null>(null);

  return (
    <div className="rounded-md border border-line bg-surface-page p-4">
      {!path ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink-primary">How will your software be connected?</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <PathCard
              icon={<Code2 className="h-5 w-5" />}
              title="My developer will connect it"
              badge="Recommended"
              text="For your own or custom software. We create the keys and a step-by-step guide with starter code to send to your developer."
              onClick={() => setPath("developer")}
            />
            <PathCard
              icon={<KeyRound className="h-5 w-5" />}
              title="I already have the details"
              text="The software already supports AI Employee and gave you an address and an API key."
              onClick={() => setPath("details")}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        </div>
      ) : path === "developer" ? (
        <DeveloperPath onDone={onDone} />
      ) : (
        <DetailsPath onDone={onDone} />
      )}
    </div>
  );
}
