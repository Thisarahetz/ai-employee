"use client";

import { useState, type FormEvent } from "react";
import { FlaskConical, Pause, Plus, Power, Trash2, Workflow, X } from "lucide-react";

import {
  useAutomationRuns,
  useAutomations,
  useAutomationTriggers,
  useDeleteAutomation,
  useSaveAutomation,
  useTestAutomation,
  type AutomationRule,
  type RuleCondition,
  type RuleInput,
} from "@/lib/hooks/use-business-setup";
import { useAiEmployees } from "@/lib/hooks/use-ai-employees";
import { cn, formatDateTime, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const OPS: { id: RuleCondition["op"]; label: string; needsValue: boolean }[] = [
  { id: "eq", label: "is", needsValue: true },
  { id: "neq", label: "is not", needsValue: true },
  { id: "contains", label: "contains", needsValue: true },
  { id: "not_contains", label: "does not contain", needsValue: true },
  { id: "gt", label: ">", needsValue: true },
  { id: "gte", label: "≥", needsValue: true },
  { id: "lt", label: "<", needsValue: true },
  { id: "lte", label: "≤", needsValue: true },
  { id: "in", label: "is one of (comma-separated)", needsValue: true },
  { id: "exists", label: "is present", needsValue: false },
  { id: "not_exists", label: "is missing", needsValue: false },
];

const RUN_COLOR: Record<string, "green" | "red" | "amber" | "gray" | "blue"> = {
  TASK_CREATED: "green",
  NOTIFIED: "green",
  FAILED: "red",
  SKIPPED_LIMIT: "amber",
  SKIPPED_RATE_LIMIT: "amber",
  SKIPPED_COOLDOWN: "gray",
  PENDING: "blue",
};

export default function AutomationsPage() {
  const rules = useAutomations();
  const save = useSaveAutomation();
  const remove = useDeleteAutomation();
  const [editing, setEditing] = useState<AutomationRule | "new" | null>(null);
  const [viewing, setViewing] = useState<AutomationRule | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(getErrorMessage(e, "Something went wrong."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Automations</h1>
          <p className="text-sm text-ink-secondary">
            When something happens in your business, an AI employee picks it up automatically — or you get notified.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New automation
        </Button>
      </div>

      {err && <p className="text-sm text-status-critical">{err}</p>}

      <Card>
        <CardContent className="pt-5">
          {rules.isLoading ? (
            <div className="h-24 animate-pulse rounded bg-surface-page" />
          ) : rules.isError ? (
            <ErrorState message={getErrorMessage(rules.error, "Unable to load automations.")} onRetry={() => rules.refetch()} />
          ) : !rules.data?.length ? (
            <EmptyState
              title="No automations yet"
              description='Example: when an appointment is cancelled, have your receptionist offer the client a new time. Industry templates add useful ones for you.'
            />
          ) : (
            <ul className="divide-y divide-line">
              {rules.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Workflow className={cn("h-5 w-5 shrink-0", r.enabled ? "text-brand-600" : "text-ink-muted")} />
                  <div className="min-w-0 flex-1">
                    <button className="text-left text-sm font-medium text-ink-primary hover:underline" onClick={() => setEditing(r)}>
                      {r.name}
                    </button>
                    <div className="text-xs text-ink-secondary">
                      When <code>{r.triggerEvent}</code>
                      {r.conditions.length ? ` (${r.conditions.length} condition${r.conditions.length > 1 ? "s" : ""})` : ""} →{" "}
                      {r.actionType === "NOTIFY_OWNER" ? "notify owner" : `task for ${r.employee?.name ?? "—"}`}
                      {r.lastTriggeredAt ? ` · last ran ${formatDateTime(r.lastTriggeredAt)}` : ""} · ran {r.triggerCount}×
                    </div>
                    {r.lastError && <div className="text-xs text-status-critical">Last error: {r.lastError}</div>}
                  </div>
                  {!r.enabled && <Badge color="gray">off</Badge>}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" title="History & test" onClick={() => setViewing(r)}>
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title={r.enabled ? "Turn off" : "Turn on"} onClick={() => act(() => save.mutateAsync({ id: r.id, enabled: !r.enabled }))}>
                      {r.enabled ? <Pause className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" title="Delete" onClick={() => confirm(`Delete "${r.name}"?`) && act(() => remove.mutateAsync(r.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How automations stay safe</CardTitle>
          <CardDescription>
            Each rule has an hourly cap and an optional cooldown per customer. Events caused by the AI itself never trigger rules
            (unless you allow it), so automations can&apos;t loop. Event details are passed to the AI as data, never as
            instructions, and sensitive actions still wait for your approval.
          </CardDescription>
        </CardHeader>
      </Card>

      {editing && <RuleModal rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && <RunsModal rule={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function RuleModal({ rule, onClose }: { rule: AutomationRule | null; onClose: () => void }) {
  const employees = useAiEmployees();
  const triggers = useAutomationTriggers();
  const save = useSaveAutomation();
  const [form, setForm] = useState<RuleInput>({
    name: rule?.name ?? "",
    triggerEvent: rule?.triggerEvent ?? "appointment.cancelled",
    conditions: rule?.conditions ?? [],
    actionType: rule?.actionType ?? "CREATE_TASK",
    employeeId: rule?.employeeId ?? "",
    taskTitle: rule?.taskTitle ?? "",
    taskDescription: rule?.taskDescription ?? "",
    priority: rule?.priority ?? "MEDIUM",
    dedupeKey: rule?.dedupeKey ?? "",
    cooldownSeconds: rule?.cooldownSeconds ?? 0,
    maxRunsPerHour: rule?.maxRunsPerHour ?? 20,
    allowAiTriggered: rule?.allowAiTriggered ?? false,
    enabled: rule?.enabled ?? true,
  });
  const set = (p: RuleInput) => setForm((f) => ({ ...f, ...p }));
  const conds = form.conditions ?? [];
  const setCond = (i: number, p: Partial<RuleCondition>) => set({ conditions: conds.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const conditions = conds.map((c) => {
      const op = OPS.find((o) => o.id === c.op)!;
      if (!op.needsValue) return { field: c.field, op: c.op };
      if (c.op === "in") return { ...c, value: String(c.value ?? "").split(",").map((v) => v.trim()).filter(Boolean) };
      const n = Number(c.value);
      return { ...c, value: ["gt", "gte", "lt", "lte"].includes(c.op) && !Number.isNaN(n) ? n : c.value };
    });
    await save.mutateAsync({
      ...form,
      id: rule?.id,
      conditions,
      employeeId: form.actionType === "CREATE_TASK" ? form.employeeId || null : null,
      dedupeKey: form.dedupeKey || null,
      cooldownSeconds: Number(form.cooldownSeconds) || 0,
      maxRunsPerHour: Number(form.maxRunsPerHour) || 20,
    });
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={rule ? "Edit automation" : "New automation"} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name" required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Offer a new slot after a cancellation" />

        <div>
          <Input
            label="When this event happens"
            required
            list="trigger-events"
            value={form.triggerEvent}
            onChange={(e) => set({ triggerEvent: e.target.value.trim() })}
            hint={`Platform events, or ${triggers.data?.externalPattern ?? "any event your connected systems send"}`}
          />
          <datalist id="trigger-events">
            {(triggers.data?.builtIn ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-primary">Only if (all must match)</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ conditions: [...conds, { field: "", op: "eq", value: "" }] })} disabled={conds.length >= 10}>
              <Plus className="h-4 w-4" /> Condition
            </Button>
          </div>
          {conds.map((c, i) => {
            const op = OPS.find((o) => o.id === c.op);
            return (
              <div key={i} className="flex gap-2">
                <input className="w-1/3 rounded-md border border-line px-2 py-1.5 text-sm" placeholder="field, e.g. reason" value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} />
                <select className="rounded-md border border-line px-2 py-1.5 text-sm" value={c.op} onChange={(e) => setCond(i, { op: e.target.value as RuleCondition["op"] })}>
                  {OPS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {op?.needsValue && (
                  <input
                    className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm"
                    placeholder="value"
                    value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")}
                    onChange={(e) => setCond(i, { value: e.target.value })}
                  />
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ conditions: conds.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Then" value={form.actionType} onChange={(e) => set({ actionType: e.target.value as RuleInput["actionType"] })}>
            <option value="CREATE_TASK">Give a task to an AI employee</option>
            <option value="NOTIFY_OWNER">Notify the owner</option>
          </Select>
          {form.actionType === "CREATE_TASK" && (
            <Select label="AI employee" required value={form.employeeId ?? ""} onChange={(e) => set({ employeeId: e.target.value })}>
              <option value="">Choose…</option>
              {(employees.data ?? []).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — {emp.role}
                </option>
              ))}
            </Select>
          )}
        </div>

        <Input
          label={form.actionType === "NOTIFY_OWNER" ? "Notification title" : "Task"}
          required
          value={form.taskTitle}
          onChange={(e) => set({ taskTitle: e.target.value })}
          hint="Use {{field}} to insert event data, e.g. Offer {{customerName}} a new time"
        />
        <Textarea label="Details (optional)" rows={2} value={form.taskDescription} onChange={(e) => set({ taskDescription: e.target.value })} />

        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Once per" hint="e.g. {{customerId}}" value={form.dedupeKey ?? ""} onChange={(e) => set({ dedupeKey: e.target.value })} />
          <Input label="Cooldown (seconds)" type="number" min="0" value={String(form.cooldownSeconds)} onChange={(e) => set({ cooldownSeconds: Number(e.target.value) })} />
          <Input label="Max runs per hour" type="number" min="1" max="200" value={String(form.maxRunsPerHour)} onChange={(e) => set({ maxRunsPerHour: Number(e.target.value) })} />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" checked={Boolean(form.allowAiTriggered)} onChange={(e) => set({ allowAiTriggered: e.target.checked })} />
          Also run for events caused by AI employees (can create chains — leave off unless you need it)
        </label>

        {save.isError && <p className="text-sm text-status-critical">{getErrorMessage(save.error, "Could not save the automation.")}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RunsModal({ rule, onClose }: { rule: AutomationRule; onClose: () => void }) {
  const runs = useAutomationRuns(rule.id);
  const test = useTestAutomation();
  const [sample, setSample] = useState('{\n  "customerId": "c_123",\n  "customerName": "Nadeesha"\n}');
  const [parseErr, setParseErr] = useState<string | null>(null);

  const runTest = () => {
    setParseErr(null);
    try {
      test.mutate({ id: rule.id, payload: JSON.parse(sample) });
    } catch {
      setParseErr("Sample event must be valid JSON.");
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={rule.name} description={`Trigger: ${rule.triggerEvent}`} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-primary">Try it with a sample event</h4>
          <Textarea rows={5} value={sample} onChange={(e) => setSample(e.target.value)} className="font-mono text-xs" />
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" onClick={runTest} isLoading={test.isPending}>
              <FlaskConical className="h-4 w-4" /> Dry run
            </Button>
            <span className="text-xs text-ink-muted">Nothing is created — this only shows what would happen.</span>
          </div>
          {parseErr && <p className="text-sm text-status-critical">{parseErr}</p>}
          {test.data && (
            <div className="rounded-md border border-line bg-surface-page p-3 text-sm">
              <div className="font-medium">{test.data.matches ? "✓ Would run" : "✗ Would not run"}</div>
              {test.data.conditions.map((c, i) => (
                <div key={i} className="text-xs text-ink-secondary">
                  {c.matched ? "✓" : "✗"} {c.field} {c.op} {c.value !== undefined ? JSON.stringify(c.value) : ""}
                </div>
              ))}
              <div className="mt-1 text-xs">
                Title: <strong>{test.data.title}</strong>
              </div>
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink-primary">Recent runs</h4>
          {!runs.data?.length ? (
            <p className="text-sm text-ink-muted">This automation hasn&apos;t been triggered yet.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {runs.data.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-xs">
                  <Badge color={RUN_COLOR[r.status] ?? "gray"}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge>
                  <span className="flex-1 text-ink-secondary">{r.message}</span>
                  <span className="text-ink-muted">{formatDateTime(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
