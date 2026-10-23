"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  CreditCard,
  Layers,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { useAdminHealth, usePlatformStats } from "@/lib/hooks/use-admin";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { CreateTenantForm } from "@/components/platform/create-tenant-form";

export default function AdminDashboardPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const statsQuery = usePlatformStats();
  const healthQuery = useAdminHealth();

  if (statsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-surface-page" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-page" />
          ))}
        </div>
      </div>
    );
  }

  if (statsQuery.isError || !statsQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(statsQuery.error, "Unable to load platform statistics.")}
        onRetry={() => statsQuery.refetch()}
      />
    );
  }

  const stats = statsQuery.data;
  const health = healthQuery.data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Platform Dashboard</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/10 px-2.5 py-0.5 text-xs font-semibold text-status-success">
              <span className="h-2 w-2 rounded-full bg-status-success" />
              Live Instance
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Global operational overview across all tenants, AI employees, and system services.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              statsQuery.refetch();
              healthQuery.refetch();
            }}
            isLoading={statsQuery.isFetching}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {isCreateOpen ? "Close form" : "Onboard Business"}
          </Button>
        </div>
      </div>

      {isCreateOpen && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-900">Create New Business Tenant</h3>
            <span className="text-xs text-brand-700">Platform Admin Onboarding</span>
          </div>
          <CreateTenantForm onDone={() => setIsCreateOpen(false)} />
        </div>
      )}

      {/* System Alert Banner if applicable */}
      {stats.systemAlerts && stats.systemAlerts.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-status-warning/20 bg-status-warning/10 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1 font-medium">{stats.systemAlerts.join(" · ")}</div>
          <Link href="/admin/ai-employees" className="text-xs font-semibold underline hover:opacity-80">
            Inspect AI Employees →
          </Link>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Businesses */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Businesses</span>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-ink-primary">{stats.tenants.total}</span>
              {stats.tenants.newThisMonth > 0 && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                  +{stats.tenants.newThisMonth} this mo
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-xs text-ink-secondary">
              <span className="flex items-center gap-1 font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {stats.tenants.active} active
              </span>
              <span>·</span>
              <span className="text-amber-700 font-medium">{stats.tenants.trial} trial</span>
              <span>·</span>
              <span className="text-rose-600 font-medium">{stats.tenants.suspended} suspended</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: AI Employees */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">AI Employees</span>
              <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                <Bot className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-ink-primary">
                {stats.aiEmployees.total}
              </span>
              <span className="text-xs text-ink-muted">deployed</span>
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-xs text-ink-secondary">
              <span className="flex items-center gap-1 font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {stats.aiEmployees.active} active
              </span>
              <span>·</span>
              <span className="text-ink-muted font-medium">{stats.aiEmployees.paused} paused</span>
              {stats.aiEmployees.needsAttention > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-700 font-bold">{stats.aiEmployees.needsAttention} alerts</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Platform Users */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Platform Users</span>
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-ink-primary">{stats.users.total}</span>
              <span className="text-xs text-ink-muted">accounts</span>
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-xs text-ink-secondary">
              <span className="font-medium text-emerald-700">{stats.users.active} active</span>
              <span>·</span>
              <span className="text-purple-600 font-medium">{stats.users.superAdmins} super admins</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Conversations */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Conversations</span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-ink-primary">
                {stats.conversations.total}
              </span>
              <span className="text-xs text-ink-muted">total</span>
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-xs text-ink-secondary">
              <span className="font-medium text-brand-600">{stats.conversations.aiHandling} AI handling</span>
              <span>·</span>
              <span className="text-ink-muted font-medium">{stats.conversations.closed} resolved</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Health Strip */}
      <Card className="bg-white">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`rounded-lg p-2 ${
                  health?.status === "healthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-primary">System Technical Status</h3>
                <p className="text-xs text-ink-secondary">
                  API Server · PostgreSQL Database · Redis Cache & Queue · AI Providers
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-ink-muted">Database:</span>
                <span className="font-semibold text-ink-primary">
                  {health?.services?.database?.latencyMs ?? 1}ms
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-ink-muted">API Uptime:</span>
                <span className="font-semibold text-ink-primary">
                  {Math.round((health?.services?.api?.uptimeSeconds ?? 0) / 60)} mins
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-ink-muted">Channels:</span>
                <span className="font-semibold text-ink-primary">
                  {health?.services?.channels?.activeChannels ?? 0} active
                </span>
              </div>
              <Link
                href="/admin/health"
                className="rounded-md bg-surface-page px-2.5 py-1 font-semibold text-brand-700 hover:bg-brand-50"
              >
                View diagnostics →
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout: Management Hub & Recent Administrative Audits */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Operations Hub */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-primary">Administration Sections</h2>
            <span className="text-xs text-ink-muted">Super Admin Direct Access</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/admin/tenants"
              className="group rounded-xl border border-line bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600 group-hover:bg-blue-100">
                  <Building2 className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="mt-3 font-semibold text-sm text-ink-primary group-hover:text-brand-700">
                Businesses / Tenants
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                Search, filter, suspend, reactivate, or change subscription plans for any business.
              </p>
            </Link>

            <Link
              href="/admin/ai-employees"
              className="group rounded-xl border border-line bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-purple-50 p-2 text-purple-600 group-hover:bg-purple-100">
                  <Bot className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="mt-3 font-semibold text-sm text-ink-primary group-hover:text-brand-700">
                AI Employees Management
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                Monitor all deployed AI agents platform-wide, pause misbehaving agents, inspect tasks.
              </p>
            </Link>

            <Link
              href="/admin/ai-templates"
              className="group rounded-xl border border-line bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-amber-50 p-2 text-amber-700 group-hover:bg-amber-100">
                  <Sparkles className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="mt-3 font-semibold text-sm text-ink-primary group-hover:text-brand-700">
                AI Templates Registry
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                Catalog of 16 industry templates with predefined prompts, roles, and action levels.
              </p>
            </Link>

            <Link
              href="/admin/business-types"
              className="group rounded-xl border border-line bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-teal-50 p-2 text-teal-600 group-hover:bg-teal-100">
                  <Layers className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="mt-3 font-semibold text-sm text-ink-primary group-hover:text-brand-700">
                Business Types & Industries
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                Salon, Clinic, Hotel, Retail, Auto, Real Estate industry defaults & recommended channels.
              </p>
            </Link>

            <Link
              href="/admin/plans"
              className="group rounded-xl border border-line bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 group-hover:bg-emerald-100">
                  <CreditCard className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="mt-3 font-semibold text-sm text-ink-primary group-hover:text-brand-700">
                Subscriptions & Plans
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                Free, Starter, Pro, Business, Enterprise tier limits, pricing, and distribution.
              </p>
            </Link>

            <Link
              href="/admin/audit"
              className="group rounded-xl border border-line bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-700 group-hover:bg-slate-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="mt-3 font-semibold text-sm text-ink-primary group-hover:text-brand-700">
                Platform Audit Logs
              </h3>
              <p className="mt-1 text-xs text-ink-secondary">
                Immutable record of administrative actions, user demotions, suspensions, and changes.
              </p>
            </Link>
          </div>
        </div>

        {/* Right Col: Recent Activity */}
        <div>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Recent Admin Activity</CardTitle>
                <Link href="/admin/audit" className="text-xs font-medium text-brand-600 hover:underline">
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!stats.recentAudits || stats.recentAudits.length === 0 ? (
                <p className="py-8 text-center text-xs text-ink-muted">No recent administrative actions recorded.</p>
              ) : (
                <div className="divide-y divide-line text-xs">
                  {stats.recentAudits.map((entry) => (
                    <div key={entry.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink-primary font-mono text-[11px] bg-surface-page px-1.5 py-0.5 rounded">
                          {entry.action}
                        </span>
                        <span className="text-ink-muted text-[10px]">{formatDateTime(entry.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-ink-secondary truncate">
                        By {entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : "Super Admin"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

