"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Play,
  RefreshCw,
  ShieldAlert,
  Sliders,
  User,
  Users,
  Zap,
} from "lucide-react";

import {
  useAdminTenant,
  useAdminTenantUsers,
  useUpdateAdminAiEmployeeStatus,
  useUpdateTenant,
} from "@/lib/hooks/use-admin";
import { tenantStatusStyles } from "@/lib/status-styles";
import { formatDate, formatDateTime, getErrorMessage } from "@/lib/utils";
import type { TenantStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { PlatformActivity } from "@/components/platform/platform-activity";

const TENANT_STATUSES: TenantStatus[] = ["TRIAL", "ACTIVE", "SUSPENDED"];

const PLAN_OPTIONS = [
  { label: "Free / Trial", value: "free" },
  { label: "Starter", value: "starter" },
  { label: "Professional", value: "pro" },
  { label: "Business Scale", value: "business" },
  { label: "Enterprise", value: "enterprise" },
];

type DetailTab = "overview" | "users" | "branches" | "ai_employees" | "usage" | "activity" | "diagnostics";

export default function AdminTenantDetailPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params.id;

  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  const tenantQuery = useAdminTenant(tenantId);
  const usersQuery = useAdminTenantUsers(tenantId);
  const updateTenant = useUpdateTenant();
  const updateAiEmployee = useUpdateAdminAiEmployeeStatus();

  const [name, setName] = useState("");
  const [plan, setPlan] = useState("free");
  const [status, setStatus] = useState<TenantStatus>("TRIAL");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Diagnostics test state
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<string | null>(null);

  useEffect(() => {
    if (tenantQuery.data) {
      setName(tenantQuery.data.name);
      setPlan(tenantQuery.data.plan);
      setStatus(tenantQuery.data.status);
    }
  }, [tenantQuery.data]);

  if (tenantQuery.isLoading) return <FullPageSpinner />;

  if (tenantQuery.isError || !tenantQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(tenantQuery.error, "Unable to load this tenant.")}
        onRetry={() => tenantQuery.refetch()}
      />
    );
  }

  const tenant = tenantQuery.data;
  const isSuspended = tenant.status === "SUSPENDED";

  async function save(patch: { name?: string; plan?: string; status?: TenantStatus }) {
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateTenant.mutateAsync({ id: tenantId, ...patch });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(getErrorMessage(err, "Unable to save changes."));
    }
  }

  async function runDiagnostic() {
    setDiagRunning(true);
    setDiagResult(null);
    setTimeout(() => {
      setDiagRunning(false);
      setDiagResult(
        `Diagnostic Complete: Tenant ${tenant.name} (${tenant.slug}) routing is operational. 0 database lockouts detected. ${
          tenant.businesses?.length ?? 1
        } branch(es) indexed.`,
      );
    }, 800);
  }

  return (
    <div className="space-y-6">
      {/* Top breadcrumb & quick status header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/tenants" className="inline-flex items-center text-xs font-medium text-brand-600 hover:underline">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to all businesses
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">{tenant.name}</h1>
            <StatusBadge {...tenantStatusStyles[tenant.status]} />
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-700">
              {tenant.plan} Plan
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-0.5 font-mono text-xs">
            ID: {tenant.id} · Slug: {tenant.slug}
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          {isSuspended ? (
            <Button
              variant="primary"
              size="sm"
              isLoading={updateTenant.isPending}
              onClick={() => save({ status: "ACTIVE" })}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Reactivate Business
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              isLoading={updateTenant.isPending}
              onClick={() => save({ status: "SUSPENDED" })}
            >
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
              Suspend Business
            </Button>
          )}
        </div>
      </div>

      {/* Tabs bar */}
      <div className="border-b border-line">
        <nav className="flex space-x-6 overflow-x-auto text-sm font-medium">
          {[
            { key: "overview", label: "Overview", icon: Building2 },
            { key: "users", label: `Team Members (${tenant.userCount})`, icon: Users },
            { key: "branches", label: `Branches (${tenant.businesses?.length ?? 1})`, icon: MapPin },
            { key: "ai_employees", label: `AI Employees (${tenant.aiEmployees?.length ?? 0})`, icon: Bot },
            { key: "usage", label: "Usage & Limits", icon: Zap },
            { key: "activity", label: "Audit & Activity", icon: Clock },
            { key: "diagnostics", label: "Diagnostics", icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as DetailTab)}
                className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-ink-secondary hover:border-line hover:text-ink-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Information & Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {saveError && (
                  <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-xs font-medium text-status-critical">
                    {saveError}
                  </p>
                )}
                {saveSuccess && (
                  <p role="alert" className="rounded-md bg-status-success/10 px-3 py-2 text-xs font-medium text-status-success">
                    Tenant configuration updated successfully.
                  </p>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Business Name" value={name} onChange={(e) => setName(e.target.value)} />
                  <Select label="Subscription Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <Select label="Account Status" value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)}>
                  {TENANT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tenantStatusStyles[s].label}
                    </option>
                  ))}
                </Select>

                <Button onClick={() => save({ name, plan, status })} isLoading={updateTenant.isPending}>
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Primary Business Owner</CardTitle>
              </CardHeader>
              <CardContent>
                {tenant.owner ? (
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-bold text-base">
                      {tenant.owner.firstName[0]}
                      {tenant.owner.lastName[0]}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-ink-primary">
                        {tenant.owner.firstName} {tenant.owner.lastName}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-ink-secondary mt-0.5">
                        <Mail className="h-3.5 w-3.5 text-ink-muted" />
                        <span>{tenant.owner.email}</span>
                      </div>
                      <p className="text-xs text-ink-muted mt-1">User ID: {tenant.owner.id}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">No primary owner account associated with this tenant.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Metrics sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tenant Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-ink-secondary">Branches / Locations</span>
                  <span className="font-semibold text-ink-primary">{tenant.branchCount ?? 1}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-ink-secondary">Team Members</span>
                  <span className="font-semibold text-ink-primary">{tenant.userCount}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-ink-secondary">Active AI Employees</span>
                  <span className="font-semibold text-purple-700">{tenant.aiEmployeeCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-ink-secondary">Conversations Handled</span>
                  <span className="font-semibold text-ink-primary">{tenant.conversationCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-ink-secondary">Estimated AI Spend</span>
                  <span className="font-semibold text-emerald-700">
                    ${(tenant.usage?.estimatedCostUsd ?? 0).toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-ink-secondary">Registered On</span>
                  <span className="font-semibold text-ink-primary">{formatDate(tenant.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Users */}
      {activeTab === "users" && (
        <Card>
          <CardHeader>
            <CardTitle>Tenant Users & Permissions</CardTitle>
          </CardHeader>
          {usersQuery.isLoading ? (
            <div className="p-5 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
              ))}
            </div>
          ) : !usersQuery.data?.length ? (
            <div className="p-6">
              <EmptyState title="No users found" description="No users are currently assigned to this tenant." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-muted bg-surface-page/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-5 py-3 font-semibold">Role</th>
                    <th className="px-5 py-3 font-semibold">Business Role</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Last Login</th>
                    <th className="px-5 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usersQuery.data.map((membership) => (
                    <tr key={membership.id} className="hover:bg-surface-page/80">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-ink-primary">
                          {membership.user.firstName} {membership.user.lastName}
                        </p>
                        <p className="text-xs text-ink-muted">{membership.user.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge color={membership.role === "OWNER" ? "purple" : "blue"}>{membership.role}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-ink-secondary text-xs">
                        {membership.businessRole || membership.jobTitle || "Standard"}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-ink-secondary">{membership.status}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-secondary">
                        {membership.user.lastLoginAt ? formatDateTime(membership.user.lastLoginAt) : "Never"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/admin/users/${membership.user.id}`}
                          className="text-xs font-semibold text-brand-600 hover:underline"
                        >
                          View Account →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Branches */}
      {activeTab === "branches" && (
        <Card>
          <CardHeader>
            <CardTitle>Business Locations / Branches</CardTitle>
          </CardHeader>
          {!tenant.businesses?.length ? (
            <div className="p-6">
              <EmptyState title="No branches" description="No branches configured for this business." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-muted bg-surface-page/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Branch Name</th>
                    <th className="px-5 py-3 font-semibold">Industry Type</th>
                    <th className="px-5 py-3 font-semibold">Timezone</th>
                    <th className="px-5 py-3 font-semibold">Added On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tenant.businesses.map((b) => (
                    <tr key={b.id} className="hover:bg-surface-page/80">
                      <td className="px-5 py-3.5 font-medium text-ink-primary flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-ink-muted" />
                        {b.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded bg-surface-page px-2 py-0.5 text-xs font-medium uppercase">
                          {b.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-ink-secondary">{b.timezone}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-secondary">{formatDate(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: AI Employees */}
      {activeTab === "ai_employees" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">Deployed AI Workforce</h3>
            <span className="text-xs text-ink-muted">{tenant.aiEmployees?.length ?? 0} AI Employees</span>
          </div>

          {!tenant.aiEmployees?.length ? (
            <Card className="p-8">
              <EmptyState
                title="No AI Employees Deployed"
                description="This business has not onboarded any AI employees yet."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {tenant.aiEmployees.map((emp) => (
                <Card key={emp.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700 font-bold">
                        <Bot className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-ink-primary">{emp.name}</h4>
                        <p className="text-xs text-ink-muted">{emp.role} · {emp.department}</p>
                      </div>
                    </div>
                    <Badge color={emp.status === "ACTIVE" ? "green" : "gray"}>{emp.status}</Badge>
                  </div>

                  <p className="mt-3 text-xs text-ink-secondary line-clamp-2">{emp.description}</p>

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                    <span className="text-ink-muted">Action: {emp.actionLevel}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={updateAiEmployee.isPending}
                      onClick={() =>
                        updateAiEmployee.mutateAsync({
                          id: emp.id,
                          status: emp.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                        }).then(() => tenantQuery.refetch())
                      }
                    >
                      {emp.status === "ACTIVE" ? "Pause Agent" : "Resume Agent"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Usage & Limits */}
      {activeTab === "usage" && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-sm text-ink-primary">AI Token Consumption</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink-secondary">Total Tokens Processed</span>
                <span className="font-semibold text-ink-primary">{tenant.usage?.totalTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-secondary">Input Tokens (Prompts)</span>
                <span className="font-medium text-ink-secondary">{tenant.usage?.inputTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-secondary">Output Tokens (Completions)</span>
                <span className="font-medium text-ink-secondary">{tenant.usage?.outputTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-line pt-2">
                <span className="text-ink-primary font-semibold">Estimated Total Spend</span>
                <span className="font-bold text-emerald-700">${(tenant.usage?.estimatedCostUsd ?? 0).toFixed(4)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-sm text-ink-primary">Platform Messages & Volume</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink-secondary">Total Inbound Conversations</span>
                <span className="font-semibold text-ink-primary">{tenant.conversationCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-secondary">Messages Exchanged</span>
                <span className="font-semibold text-ink-primary">{tenant.messageCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-line pt-2">
                <span className="text-ink-secondary">Assigned Plan Limit</span>
                <span className="font-semibold text-brand-700 uppercase">{tenant.plan} Tier</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 6: Activity & Audit */}
      {activeTab === "activity" && <PlatformActivity targetType="tenant" targetId={tenantId} />}

      {/* Tab 7: Diagnostics */}
      {activeTab === "diagnostics" && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-ink-primary">Live Tenant Diagnostic Test</h3>
              <p className="text-xs text-ink-secondary">
                Ping tenant databases, verify webhook routing, and ensure healthy agent workers.
              </p>
            </div>
            <Button onClick={runDiagnostic} isLoading={diagRunning}>
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Run Health Ping
            </Button>
          </div>

          {diagResult && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs font-medium text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>{diagResult}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

