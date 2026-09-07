"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  Sliders,
  Workflow,
  Cpu,
  ArrowRight,
  Save,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBusinesses, useUpdateBusiness } from "@/lib/hooks/use-businesses";
import { apiClient } from "@/lib/api-client";

export default function SettingsPage() {
  const { user, activeTenant } = useAuth();
  const businessesQuery = useBusinesses();
  const updateBusiness = useUpdateBusiness();

  const primaryBusiness = businessesQuery.data?.[0];

  const [businessName, setBusinessName] = useState("");
  const [currency, setCurrency] = useState("USD ($)");
  const [timezone, setTimezone] = useState("UTC");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (primaryBusiness) {
      setBusinessName(primaryBusiness.name);
      setTimezone(primaryBusiness.timezone || "UTC");
    }
  }, [primaryBusiness]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;

    setIsSaving(true);
    try {
      // 1. Update Tenant Name
      try {
        await apiClient.patch("/tenants", { name: businessName.trim() });
      } catch {
        // Fallback if tenant patch restricted
      }

      // 2. Update Primary Business
      if (primaryBusiness) {
        await updateBusiness.mutateAsync({
          id: primaryBusiness.id,
          name: businessName.trim(),
          timezone,
        });
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold text-ink-primary">Business Settings</h1>
        <p className="text-xs text-ink-secondary mt-1">
          Manage your business profile, customer channels, and advanced preferences.
        </p>
      </div>

      {/* 1. Business Profile Form */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-brand-600" />
          <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
            Business Profile
          </h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-ink-primary">
              Company / Business Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-xl border border-line px-3.5 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ink-primary">
                Display Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
              >
                <option value="USD ($)">USD ($)</option>
                <option value="LKR (Rs.)">LKR (Rs.)</option>
                <option value="GBP (£)">GBP (£)</option>
                <option value="EUR (€)">EUR (€)</option>
                <option value="AUD ($)">AUD ($)</option>
                <option value="INR (₹)">INR (₹)</option>
                <option value="AED (د.إ)">AED (د.إ)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ink-primary">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Colombo">Asia/Colombo (IST +5:30)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT +8:00)</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-300" /> Changes Saved!
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" /> Save Profile
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Customer Channels Quick Link */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink-primary">
              Customer Channels (WhatsApp &amp; Live Chat)
            </h3>
            <p className="text-xs text-ink-secondary">
              Connect where your customers chat with your AI employees.
            </p>
          </div>
        </div>

        <Link
          href="/channels"
          className="inline-flex items-center gap-1 rounded-xl bg-surface-page px-4 py-2 text-xs font-bold text-ink-primary border border-line hover:bg-slate-100 transition-colors shrink-0"
        >
          Manage Channels <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 3. Advanced Developer & Automation Settings (Safely Tucked Away) */}
      <div className="rounded-2xl border border-line bg-white shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between p-6 text-left hover:bg-surface-page transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink-primary">
                Advanced Tools &amp; Configurations
              </h3>
              <p className="text-xs text-ink-secondary">
                For developers and power users: raw workflows, AI provider keys, and custom API webhooks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
            <span>{showAdvanced ? "Hide" : "Show"}</span>
            {showAdvanced ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </button>

        {showAdvanced && (
          <div className="p-6 pt-0 border-t border-line/60 bg-surface-page/30 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/workflows"
              className="rounded-xl border border-line bg-white p-4 hover:border-brand-500 hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Workflow className="h-4 w-4 text-purple-600" />
                <h4 className="text-xs font-bold text-ink-primary">
                  Workflow Builder
                </h4>
              </div>
              <p className="text-[11px] text-ink-secondary">
                Inspect and customize visual node automations and triggers.
              </p>
            </Link>

            <Link
              href="/ai-configuration"
              className="rounded-xl border border-line bg-white p-4 hover:border-brand-500 hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Cpu className="h-4 w-4 text-brand-600" />
                <h4 className="text-xs font-bold text-ink-primary">
                  AI Model Selection
                </h4>
              </div>
              <p className="text-[11px] text-ink-secondary">
                Configure OpenAI, Anthropic, or local Ollama LLM credentials.
              </p>
            </Link>

            <Link
              href="/integrations"
              className="rounded-xl border border-line bg-white p-4 hover:border-brand-500 hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <SettingsIcon className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-ink-primary">
                  API &amp; Webhooks
                </h4>
              </div>
              <p className="text-[11px] text-ink-secondary">
                Manage Bearer tokens, REST endpoints, and custom integrations.
              </p>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
