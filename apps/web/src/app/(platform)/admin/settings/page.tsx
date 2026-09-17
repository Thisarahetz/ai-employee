"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Save, Trash2 } from "lucide-react";

import { useAdminSettings, useCleanDatabase, useUpdateAdminSettings } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const CONFIRM_PHRASE = "CLEAN DATABASE";

export default function AdminSettingsPage() {
  const settingsQuery = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const cleanDatabase = useCleanDatabase();

  const [defaultPlan, setDefaultPlan] = useState("free");
  const [trialDays, setTrialDays] = useState(14);
  const [defaultFastModel, setDefaultFastModel] = useState("gpt-4o-mini");
  const [defaultReasoningModel, setDefaultReasoningModel] = useState("claude-3-5-sonnet");
  const [alertWebhookUrl, setAlertWebhookUrl] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemNotice, setSystemNotice] = useState("");

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Danger Zone state
  const [dangerChecked, setDangerChecked] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [cleanResult, setCleanResult] = useState<{
    removed: { tenants: number; nonAdminUsers: number; conversations: number; messages: number };
  } | null>(null);
  const [cleanError, setCleanError] = useState<string | null>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setDefaultPlan(settingsQuery.data.defaultPlan);
      setTrialDays(settingsQuery.data.trialDays);
      setDefaultFastModel(settingsQuery.data.defaultFastModel);
      setDefaultReasoningModel(settingsQuery.data.defaultReasoningModel);
      setAlertWebhookUrl(settingsQuery.data.alertWebhookUrl || "");
      setMaintenanceMode(settingsQuery.data.maintenanceMode);
      setSystemNotice(settingsQuery.data.systemNotice || "");
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (showConfirmModal) {
      setConfirmInput("");
      setTimeout(() => confirmInputRef.current?.focus(), 50);
    }
  }, [showConfirmModal]);

  if (settingsQuery.isLoading) return <FullPageSpinner />;

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(settingsQuery.error, "Unable to load platform settings.")}
        onRetry={() => settingsQuery.refetch()}
      />
    );
  }

  async function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateSettings.mutateAsync({
        defaultPlan,
        trialDays: Number(trialDays),
        defaultFastModel,
        defaultReasoningModel,
        alertWebhookUrl,
        maintenanceMode,
        systemNotice,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(getErrorMessage(err, "Failed to save platform settings."));
    }
  }

  async function handleCleanDatabase() {
    setCleanError(null);
    setCleanResult(null);
    try {
      const result = await cleanDatabase.mutateAsync();
      setCleanResult(result);
      setShowConfirmModal(false);
      setDangerChecked(false);
      setConfirmInput("");
    } catch (err) {
      setCleanError(getErrorMessage(err, "Database clean failed."));
    }
  }

  const confirmPhraseMatches = confirmInput.trim() === CONFIRM_PHRASE;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Platform Settings</h1>
          <p className="text-sm text-ink-secondary mt-1">
            Global system configurations, default tenant quotas, and external telemetry alerts.
          </p>
        </div>

        <Button onClick={handleSave} isLoading={updateSettings.isPending}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save Configurations
        </Button>
      </div>

      {saveSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Platform configurations updated and applied instance-wide.
        </div>
      )}

      {saveError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600" />
          {saveError}
        </div>
      )}

      {/* Tenant Default Quotas */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Onboarding Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Default Registration Plan"
              value={defaultPlan}
              onChange={(e) => setDefaultPlan(e.target.value)}
            >
              <option value="free">Free / Trial</option>
              <option value="starter">Starter</option>
              <option value="pro">Professional</option>
            </Select>

            <Input
              label="Default Trial Period (Days)"
              type="number"
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* AI Model Architecture */}
      <Card>
        <CardHeader>
          <CardTitle>Global AI Model Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Default Fast Router Model"
              value={defaultFastModel}
              onChange={(e) => setDefaultFastModel(e.target.value)}
            >
              <option value="gpt-4o-mini">OpenAI gpt-4o-mini (Default)</option>
              <option value="gemini-1.5-flash">Google Gemini 1.5 Flash</option>
              <option value="claude-3-haiku">Anthropic Claude 3 Haiku</option>
            </Select>

            <Select
              label="Default Reasoning / Agent Model"
              value={defaultReasoningModel}
              onChange={(e) => setDefaultReasoningModel(e.target.value)}
            >
              <option value="claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet (Default)</option>
              <option value="gpt-4o">OpenAI gpt-4o</option>
              <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Operational Controls & Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Operations &amp; Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Security Alert Webhook URL (Slack / Discord)"
            placeholder="https://hooks.slack.com/services/..."
            value={alertWebhookUrl}
            onChange={(e) => setAlertWebhookUrl(e.target.value)}
          />

          <Input
            label="Global Maintenance Announcement"
            placeholder="System fully operational."
            value={systemNotice}
            onChange={(e) => setSystemNotice(e.target.value)}
          />

          <div className="flex items-center justify-between rounded-lg border border-line p-3">
            <div>
              <p className="font-semibold text-xs text-ink-primary">Maintenance Mode</p>
              <p className="text-[11px] text-ink-muted">
                Temporarily pause new business self-signups during system upgrades.
              </p>
            </div>
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      <Card className="border-rose-300 bg-rose-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-rose-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-primary">Clean / Reset Database</p>
                <p className="mt-0.5 text-[11px] text-ink-muted leading-relaxed">
                  Permanently deletes <strong>all tenant data</strong> — tenants, businesses,
                  conversations, messages, customers, integrations, AI employees, knowledge bases,
                  and all non-admin user accounts. The database schema is preserved and
                  SUPER_ADMIN accounts remain intact. <strong>This cannot be undone.</strong>
                </p>
                <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dangerChecked}
                    onChange={(e) => {
                      setDangerChecked(e.target.checked);
                      setCleanResult(null);
                      setCleanError(null);
                    }}
                    className="h-3.5 w-3.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-[11px] text-rose-700 font-medium">
                    I understand this will permanently delete all data and cannot be undone.
                  </span>
                </label>
              </div>

              <Button
                variant="danger"
                size="sm"
                disabled={!dangerChecked}
                onClick={() => setShowConfirmModal(true)}
                className="shrink-0"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clean Database
              </Button>
            </div>

            {/* Post-clean success summary */}
            {cleanResult && (
              <div className="mt-3 rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Database cleaned successfully.
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  <li>{cleanResult.removed.tenants} tenant(s) removed</li>
                  <li>{cleanResult.removed.nonAdminUsers} non-admin user(s) removed</li>
                  <li>{cleanResult.removed.conversations} conversation(s) removed</li>
                  <li>{cleanResult.removed.messages} message(s) removed</li>
                </ul>
              </div>
            )}

            {/* Clean error */}
            {cleanError && (
              <div className="mt-3 rounded-md bg-rose-100 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                {cleanError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Confirmation Modal ───────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-rose-200 overflow-hidden">
            {/* Modal header */}
            <div className="bg-rose-600 px-6 py-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-white shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">Confirm Database Clean</p>
                <p className="text-[11px] text-rose-200">This action is irreversible.</p>
              </div>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-ink-secondary leading-relaxed">
                You are about to permanently delete <strong>all tenant data</strong> and
                non-admin user accounts from the platform database. SUPER_ADMIN accounts
                and the database schema will be preserved.
              </p>

              <div>
                <label className="block text-xs font-semibold text-ink-primary mb-1.5">
                  Type{" "}
                  <code className="rounded bg-rose-100 px-1 py-0.5 text-rose-700 font-mono text-[11px]">
                    {CONFIRM_PHRASE}
                  </code>{" "}
                  to confirm
                </label>
                <input
                  ref={confirmInputRef}
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && confirmPhraseMatches) handleCleanDatabase();
                  }}
                  placeholder={CONFIRM_PHRASE}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              {cleanError && (
                <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  {cleanError}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-surface-subtle border-t border-line">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmInput("");
                  setCleanError(null);
                }}
                disabled={cleanDatabase.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!confirmPhraseMatches}
                isLoading={cleanDatabase.isPending}
                onClick={handleCleanDatabase}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clean Database
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

