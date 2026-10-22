"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, LayoutTemplate, Pencil, Trash2 } from "lucide-react";

import { useAiEmployeeTemplates, useApplyTemplate, type ApplyTemplateResult } from "@/lib/hooks/use-ai-employees";
import {
  useBusinessProfile,
  useCopyTemplate,
  useDeleteTemplate,
  useTemplateDetail,
  useUpdateBusinessProfile,
  useUpdateTemplate,
} from "@/lib/hooks/use-business-setup";
import type { BusinessTemplateInfo } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

export default function BusinessSetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Business setup</h1>
        <p className="text-sm text-ink-secondary">
          Tell your AI employees about your business, and set up your team from an industry template you can customise.
        </p>
      </div>
      <ProfileCard />
      <TemplatesCard />
    </div>
  );
}

function ProfileCard() {
  const profile = useBusinessProfile();
  const update = useUpdateBusinessProfile();
  const [form, setForm] = useState({ description: "", services: "", hours: "", brandVoice: "", policies: "", goals: "", departments: "", timezone: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const d = profile.data;
    if (!d) return;
    setForm({
      description: d.profile.description ?? "",
      services: d.profile.services ?? "",
      hours: d.profile.hours ?? "",
      brandVoice: d.profile.brandVoice ?? "",
      policies: d.profile.policies ?? "",
      goals: (d.profile.goals ?? []).join("\n"),
      departments: (d.profile.departments ?? []).join(", "),
      timezone: d.timezone,
    });
  }, [profile.data]);

  if (profile.isError) return <ErrorState message={getErrorMessage(profile.error, "Unable to load your business profile.")} onRetry={() => profile.refetch()} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await update.mutateAsync({
      description: form.description,
      services: form.services,
      hours: form.hours,
      brandVoice: form.brandVoice,
      policies: form.policies,
      goals: form.goals.split("\n").map((g) => g.trim()).filter(Boolean),
      departments: form.departments.split(",").map((g) => g.trim()).filter(Boolean),
      timezone: form.timezone,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const ta = (k: keyof typeof form, label: string, rows: number, hint?: string) => (
    <Textarea label={label} hint={hint} rows={rows} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>Every AI employee reads this before each task. Keep it factual — they will rely on it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {ta("description", "About the business", 3)}
          <div className="grid gap-4 md:grid-cols-2">
            {ta("services", "Services / products", 4)}
            {ta("policies", "Policies", 4, "Cancellation, refunds, deposits…")}
            {ta("hours", "Opening hours", 2)}
            {ta("brandVoice", "Brand voice", 2, "How you sound to customers")}
            {ta("goals", "Goals", 3, "One per line, e.g. Fill weekday mornings")}
            <div className="space-y-4">
              <Input label="Departments" hint="Comma-separated" value={form.departments} onChange={(e) => setForm((f) => ({ ...f, departments: e.target.value }))} />
              <Input label="Timezone" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
            </div>
          </div>
          {update.isError && <p className="text-sm text-status-critical">{getErrorMessage(update.error, "Could not save.")}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" isLoading={update.isPending}>
              Save profile
            </Button>
            {saved && <span className="text-sm text-status-good">Saved</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TemplatesCard() {
  const templates = useAiEmployeeTemplates();
  const profile = useBusinessProfile();
  const copy = useCopyTemplate();
  const remove = useDeleteTemplate();
  const [applying, setApplying] = useState<BusinessTemplateInfo | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const current = profile.data?.industryTemplateKey;

  const list = (templates.data ?? []).filter(
    (t) => !filter.trim() || `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Industry templates</CardTitle>
            <CardDescription>AI roles, recurring work and automations for your kind of business. Copy one to customise it.</CardDescription>
          </div>
          <input
            className="w-56 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="Search industries…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {err && <p className="mb-3 text-sm text-status-critical">{err}</p>}
        {templates.isError ? (
          <ErrorState message={getErrorMessage(templates.error, "Unable to load templates.")} onRetry={() => templates.refetch()} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((t) => (
              <div key={t.templateId} className="flex flex-col rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-semibold text-ink-primary">{t.name}</span>
                  </div>
                  <div className="flex gap-1">
                    {t.owner === "business" && <Badge color="purple">yours</Badge>}
                    {current === t.id && <Badge color="green">in use</Badge>}
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{t.description || t.category}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  {t.employeeCount} roles · {t.scheduleCount ?? 0} recurring · {t.ruleCount ?? 0} automations
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setApplying(t)}>
                    Use
                  </Button>
                  {t.owner === "business" ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(t.templateId!)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(`Delete "${t.name}"? Employees already hired from it stay.`)) return;
                          try {
                            await remove.mutateAsync(t.templateId!);
                          } catch (e) {
                            setErr(getErrorMessage(e));
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={copy.isPending && copy.variables?.basedOnId === t.templateId}
                      onClick={async () => {
                        setErr(null);
                        try {
                          const created = await copy.mutateAsync({ basedOnId: t.templateId! });
                          setEditingId(created.id);
                        } catch (e) {
                          setErr(getErrorMessage(e, "Could not copy the template."));
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Customise
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {applying && <ApplyModal template={applying} onClose={() => setApplying(null)} />}
      {editingId && <EditTemplateModal id={editingId} onClose={() => setEditingId(null)} />}
    </Card>
  );
}

function ApplyModal({ template, onClose }: { template: BusinessTemplateInfo; onClose: () => void }) {
  const apply = useApplyTemplate();
  const [keys, setKeys] = useState<string[]>(template.employees.map((e) => e.key));
  const [enable, setEnable] = useState(false);
  const [result, setResult] = useState<ApplyTemplateResult | null>(null);

  if (result) {
    return (
      <Modal isOpen onClose={onClose} title={`${result.template} is set up`}>
        <div className="space-y-3 text-sm text-ink-secondary">
          <p>
            {result.employees.filter((e) => e.created).length} new AI employee(s) ({result.employees.filter((e) => !e.created).length} already existed),{" "}
            {result.schedulesCreated} recurring task(s) and {result.rulesCreated} automation(s){" "}
            {result.automationsEnabled ? "— running now." : "— switched off until you turn them on."}
          </p>
          {result.problems.length > 0 && (
            <ul className="list-disc pl-5 text-status-critical">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={`Use “${template.name}”`} description="Existing employees with the same role are kept, not duplicated.">
      <div className="space-y-4">
        <div className="space-y-2">
          {template.employees.map((e) => (
            <label key={e.key} className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={keys.includes(e.key)}
                onChange={(ev) => setKeys((k) => (ev.target.checked ? [...k, e.key] : k.filter((x) => x !== e.key)))}
              />
              <span>
                <span className="block text-sm font-medium text-ink-primary">
                  {e.name} <span className="text-xs font-normal text-ink-muted">· {e.department}</span>
                </span>
                <span className="text-xs text-ink-secondary">{e.description}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-secondary">
          <input type="checkbox" className="mt-0.5" checked={enable} onChange={(e) => setEnable(e.target.checked)} />
          Start the template&apos;s recurring work and automations now (they use AI credit when they run)
        </label>
        {apply.isError && <p className="text-sm text-status-critical">{getErrorMessage(apply.error, "Could not apply the template.")}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!keys.length}
            isLoading={apply.isPending}
            onClick={async () => setResult(await apply.mutateAsync({ businessType: template.id, selectedKeys: keys, enableAutomations: enable }))}
          >
            Set up {keys.length} employee(s)
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Your own template: name, description and the full definition (roles, schedules, rules) as JSON. */
function EditTemplateModal({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useTemplateDetail(id);
  const update = useUpdateTemplate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [json, setJson] = useState("");
  const [parseErr, setParseErr] = useState<string | null>(null);

  useEffect(() => {
    if (!detail.data) return;
    setName(detail.data.name);
    setDescription(detail.data.description);
    setJson(JSON.stringify(detail.data.definition, null, 2));
  }, [detail.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setParseErr(null);
    let definition: unknown;
    try {
      definition = JSON.parse(json);
    } catch {
      setParseErr("The definition is not valid JSON.");
      return;
    }
    await update.mutateAsync({ id, name, description, definition });
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="Customise template" description="Changes apply the next time you use the template." maxWidth="max-w-3xl">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Textarea
          label="Roles, recurring work and automations"
          hint="employees[] (key, name, role, department, responsibilities, actionLevel, systemPrompt), schedules[] (employeeKey, title, cron), rules[] (name, triggerEvent, employeeKey, taskTitle…)"
          rows={18}
          className="font-mono text-xs"
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
        {(parseErr || update.isError) && <p className="text-sm text-status-critical">{parseErr ?? getErrorMessage(update.error, "Could not save.")}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={update.isPending} disabled={!detail.data}>
            Save template
          </Button>
        </div>
      </form>
    </Modal>
  );
}
