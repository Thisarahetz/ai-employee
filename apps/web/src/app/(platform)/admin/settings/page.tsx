"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Save, Settings, ShieldAlert, Sparkles } from "lucide-react";

import { useAdminSettings, useUpdateAdminSettings } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function AdminSettingsPage() {
  const settingsQuery = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();

  const [defaultPlan, setDefaultPlan] = useState("free");
  const [trialDays, setTrialDays] = useState(14);
  const [defaultFastModel, setDefaultFastModel] = useState("gpt-4o-mini");
  const [defaultReasoningModel, setDefaultReasoningModel] = useState("claude-3-5-sonnet");
  const [alertWebhookUrl, setAlertWebhookUrl] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemNotice, setSystemNotice] = useState("");

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
          <CardTitle>Platform Operations & Alerts</CardTitle>
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
    </div>
  );
}
