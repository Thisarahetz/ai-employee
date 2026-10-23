"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, Pause, Play, Plus, Power, Trash2 } from "lucide-react";

import {
  useAiUsage,
  useDeleteSchedule,
  useRunScheduleNow,
  useSaveSchedule,
  useSchedules,
  useUpdateLimits,
  type ScheduleInput,
} from "@/lib/hooks/use-ai-workforce";
import { useAiEmployees } from "@/lib/hooks/use-ai-employees";
import type { AiLimits, AiTaskSchedule } from "@/lib/types";
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

const PRESETS: { label: string; cron: string }[] = [
  { label: "Every weekday at 9:00", cron: "0 9 * * 1-5" },
  { label: "Every day at 8:00", cron: "0 8 * * *" },
  { label: "Every Monday at 9:00", cron: "0 9 * * 1" },
  { label: "Every hour, 9:00–18:00", cron: "0 9-18 * * *" },
  { label: "First day of the month at 9:00", cron: "0 9 1 * *" },
];

const usd = (n: number | null | undefined) => (n === null || n === undefined ? "No limit" : `$${n.toFixed(2)}`);

export default function AutomationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Schedules &amp; AI limits</h1>
        <p className="text-sm text-ink-secondary">
          Give AI employees recurring work, and control how much they can spend and do.
        </p>
      </div>
      <UsageCard />
      <SchedulesCard />
    </div>
  );
}

// ── Usage & limits ─────────────────────────────────────────────────────────

function Meter({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-medium text-ink-primary">
          {usd(used)} <span className="text-ink-muted">/ {usd(cap)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-surface-page">
        <div
          className={cn("h-2 rounded-full", pct >= 100 ? "bg-status-critical" : pct >= 80 ? "bg-amber-500" : "bg-brand-600")}
          style={{ width: `${cap ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

function UsageCard() {
  const usage = useAiUsage();
  const update = useUpdateLimits();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const l = usage.data?.limits;
    if (!l) return;
    setForm({
      dailyBudgetUsd: l.dailyBudgetUsd?.toString() ?? "",
      monthlyBudgetUsd: l.monthlyBudgetUsd?.toString() ?? "",
      maxTaskCostUsd: l.maxTaskCostUsd.toString(),
      maxTaskSteps: l.maxTaskSteps.toString(),
      maxConcurrentTasks: l.maxConcurrentTasks.toString(),
      maxTasksPerDay: l.maxTasksPerDay.toString(),
    });
  }, [usage.data?.limits]);

  if (usage.isLoading) return <Card className="h-48 animate-pulse" />;
  if (usage.isError || !usage.data) {
    return <ErrorState message={getErrorMessage(usage.error, "Unable to load AI usage.")} onRetry={() => usage.refetch()} />;
  }
  const { limits, spentTodayUsd, spentThisMonthUsd, tasksCreatedToday, runningTasks, activeSchedules } = usage.data;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const patch: Partial<AiLimits> = {};
    const money = (k: "dailyBudgetUsd" | "monthlyBudgetUsd") => (form[k]?.trim() ? Number(form[k]) : null);
    patch.dailyBudgetUsd = money("dailyBudgetUsd");
    patch.monthlyBudgetUsd = money("monthlyBudgetUsd");
    patch.maxTaskCostUsd = Number(form.maxTaskCostUsd);
    patch.maxTaskSteps = Number(form.maxTaskSteps);
    patch.maxConcurrentTasks = Number(form.maxConcurrentTasks);
    patch.maxTasksPerDay = Number(form.maxTasksPerDay);
    await update.mutateAsync(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const field = (k: string, label: string, hint?: string, step = "1") => (
    <Input
      label={label}
      hint={hint}
      type="number"
      min="0"
      step={step}
      value={form[k] ?? ""}
      onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
    />
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>AI usage</CardTitle>
            <CardDescription>
              Measured from what the AI provider actually billed. Work pauses automatically when a budget is reached.
            </CardDescription>
          </div>
          <Button
            variant={limits.aiEnabled ? "secondary" : "primary"}
            size="sm"
            isLoading={update.isPending}
            onClick={() => update.mutate({ aiEnabled: !limits.aiEnabled })}
          >
            <Power className="h-4 w-4" />
            {limits.aiEnabled ? "Switch AI workforce off" : "Switch AI workforce on"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!limits.aiEnabled && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The AI workforce is switched off. No tasks or schedules will run until you switch it back on.
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <Meter label="Spent today (UTC)" used={spentTodayUsd} cap={limits.dailyBudgetUsd} />
          <Meter label="Spent this month" used={spentThisMonthUsd} cap={limits.monthlyBudgetUsd} />
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ["Running now", `${runningTasks} / ${limits.maxConcurrentTasks}`],
            ["Tasks today", `${tasksCreatedToday} / ${limits.maxTasksPerDay}`],
            ["Active schedules", `${activeSchedules} / ${limits.maxSchedules}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-page px-3 py-2">
              <div className="text-xs text-ink-muted">{k}</div>
              <div className="text-base font-semibold text-ink-primary">{v}</div>
            </div>
          ))}
        </div>

        <form onSubmit={save} className="space-y-4 border-t border-line pt-5">
          <div className="grid gap-4 md:grid-cols-3">
            {field("dailyBudgetUsd", "Daily budget (USD)", "Empty = no daily limit", "0.01")}
            {field("monthlyBudgetUsd", "Monthly budget (USD)", "Empty = no monthly limit", "0.01")}
            {field("maxTaskCostUsd", "Max cost per task (USD)", "Stops a runaway task", "0.01")}
            {field("maxTaskSteps", "Max steps per task", "Tool calls before it must report")}
            {field("maxConcurrentTasks", "Tasks at the same time")}
            {field("maxTasksPerDay", "Tasks per day")}
          </div>
          {update.isError && <p className="text-sm text-status-critical">{getErrorMessage(update.error, "Could not save limits.")}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" isLoading={update.isPending}>
              Save limits
            </Button>
            {saved && <span className="text-sm text-emerald-700">Saved</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Schedules ──────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "green" | "red" | "amber" | "gray" | "blue"> = {
  COMPLETED: "green",
  FAILED: "red",
  WAITING_APPROVAL: "amber",
  SKIPPED_OVERLAP: "gray",
  SKIPPED_LIMIT: "amber",
  INVALID_CRON: "red",
  QUEUED: "blue",
};

function SchedulesCard() {
  const schedules = useSchedules();
  const save = useSaveSchedule();
  const remove = useDeleteSchedule();
  const runNow = useRunScheduleNow();
  const [editing, setEditing] = useState<AiTaskSchedule | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(getErrorMessage(err, "Something went wrong."));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Recurring work</CardTitle>
            <CardDescription>Each run becomes a task you can follow in the Command Center.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New schedule
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {actionError && <p className="mb-3 text-sm text-status-critical">{actionError}</p>}
        {schedules.isLoading ? (
          <div className="h-24 animate-pulse rounded bg-surface-page" />
        ) : schedules.isError ? (
          <ErrorState message={getErrorMessage(schedules.error, "Unable to load schedules.")} onRetry={() => schedules.refetch()} />
        ) : !schedules.data?.length ? (
          <EmptyState
            title="No recurring work yet"
            description="For example: every weekday at 9:00, have your analyst review yesterday's bookings and flag no-shows."
          />
        ) : (
          <ul className="divide-y divide-line">
            {schedules.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <CalendarClock className={cn("h-5 w-5 shrink-0", s.enabled ? "text-brand-600" : "text-ink-muted")} />
                <div className="min-w-0 flex-1">
                  <button className="text-left text-sm font-medium text-ink-primary hover:underline" onClick={() => setEditing(s)}>
                    {s.title}
                  </button>
                  <div className="text-xs text-ink-secondary">
                    {s.employee?.name ?? "Unassigned"} · <code>{s.cron}</code> ({s.timezone})
                    {s.enabled && s.nextRunAt ? ` · next ${formatDateTime(s.nextRunAt)}` : ""}
                  </div>
                </div>
                {s.lastStatus && <Badge color={STATUS_COLOR[s.lastStatus] ?? "gray"}>{s.lastStatus.replace(/_/g, " ").toLowerCase()}</Badge>}
                {!s.enabled && <Badge color="gray">paused</Badge>}
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" title="Run now" onClick={() => act(() => runNow.mutateAsync(s.id))}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={s.enabled ? "Pause" : "Resume"}
                    onClick={() => act(() => save.mutateAsync({ id: s.id, enabled: !s.enabled }))}
                  >
                    {s.enabled ? <Pause className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Delete"
                    onClick={() => confirm(`Delete "${s.title}"?`) && act(() => remove.mutateAsync(s.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && <ScheduleModal schedule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ScheduleModal({ schedule, onClose }: { schedule: AiTaskSchedule | null; onClose: () => void }) {
  const employees = useAiEmployees();
  const save = useSaveSchedule();
  const [form, setForm] = useState<ScheduleInput>({
    employeeId: schedule?.employeeId ?? "",
    title: schedule?.title ?? "",
    description: schedule?.description ?? "",
    priority: schedule?.priority ?? "MEDIUM",
    cron: schedule?.cron ?? PRESETS[0]!.cron,
    timezone: schedule?.timezone,
    overlapPolicy: schedule?.overlapPolicy ?? "SKIP",
  });
  const preset = PRESETS.find((p) => p.cron === form.cron)?.cron ?? "custom";
  const set = (patch: ScheduleInput) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ ...form, id: schedule?.id });
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={schedule ? "Edit schedule" : "New schedule"} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <Select label="AI employee" required value={form.employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
          <option value="">Choose…</option>
          {(employees.data ?? []).map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} — {emp.role}
            </option>
          ))}
        </Select>
        <Input label="What should they do?" required maxLength={200} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        <Textarea
          label="Details (optional)"
          rows={3}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="When" value={preset} onChange={(e) => e.target.value !== "custom" && set({ cron: e.target.value })}>
            {PRESETS.map((p) => (
              <option key={p.cron} value={p.cron}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom (cron)…</option>
          </Select>
          <Input
            label="Cron expression"
            hint="minute hour day month weekday"
            value={form.cron}
            onChange={(e) => set({ cron: e.target.value })}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Timezone" placeholder="Business timezone" value={form.timezone ?? ""} onChange={(e) => set({ timezone: e.target.value || undefined })} />
          <Select label="Priority" value={form.priority} onChange={(e) => set({ priority: e.target.value as ScheduleInput["priority"] })}>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Select
            label="If still running"
            value={form.overlapPolicy}
            onChange={(e) => set({ overlapPolicy: e.target.value as "SKIP" | "QUEUE" })}
          >
            <option value="SKIP">Skip this run</option>
            <option value="QUEUE">Queue another</option>
          </Select>
        </div>
        {save.isError && <p className="text-sm text-status-critical">{getErrorMessage(save.error, "Could not save the schedule.")}</p>}
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
