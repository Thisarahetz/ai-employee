"use client";

import React from "react";
import Link from "next/link";
import {
  Bot,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  TrendingUp,
  ShoppingBag,
  MessageSquare,
  CheckCircle2,
  Clock,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Pause,
  Play,
  FileText,
  Smartphone,
  Check,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useActiveLocation } from "@/lib/location-context";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { useConversations } from "@/lib/hooks/use-conversations";
import { useTeam } from "@/lib/hooks/use-team";
import {
  useAiEmployees,
  useAiEmployeeStats,
  useAiEmployeeApprovals,
  useAiEmployeeActivities,
  useToggleEmployeeStatus,
} from "@/lib/hooks/use-ai-employees";
import { formatDateTime } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeLocationId } = useActiveLocation();
  const businessesQuery = useBusinesses();
  const teamQuery = useTeam();
  const team = teamQuery.data || [];
  const pendingTeamInvites = team.filter((m) => m.status === "INVITED");
  const currentBusiness =
    businessesQuery.data?.find((b) => b.id === activeLocationId) ||
    businessesQuery.data?.[0];

  const employeesQuery = useAiEmployees();
  const statsQuery = useAiEmployeeStats();
  const pendingApprovalsQuery = useAiEmployeeApprovals("PENDING");
  const activitiesQuery = useAiEmployeeActivities({ limit: 6 });
  const totalConversationsQuery = useConversations("ALL", 1, activeLocationId);
  const toggleStatus = useToggleEmployeeStatus();

  const employees = employeesQuery.data || [];
  const activeEmployees = employees.filter((e) => e.status === "ACTIVE");
  const pausedEmployees = employees.filter((e) => e.status === "PAUSED");
  const pendingApprovals = pendingApprovalsQuery.data || [];
  const recentActivities = activitiesQuery.data || [];

  // Aggregated performance metrics
  const totalConversations =
    totalConversationsQuery.data?.total ??
    employees.reduce((acc, e) => acc + (e.stats?.conversations || 0), 0);
  const totalOrdersAssisted = employees.reduce(
    (acc, e) => acc + (e.stats?.ordersAssisted || 0),
    0
  );
  const totalTasksCompleted = employees.reduce(
    (acc, e) => acc + (e.stats?.tasksCompleted || 0),
    0
  );
  const avgSuccessRate = employees.length
    ? Math.round(
        employees.reduce((acc, e) => acc + (e.stats?.successRate || 95), 0) /
          employees.length
      )
    : 98;

  // Personalized Greeting
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 18
      ? "Good afternoon"
      : "Good evening";
  const ownerName = user?.firstName || "Business Owner";
  const businessDisplayName = currentBusiness?.name || "My Business";

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Welcome Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-line bg-white p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-ink-primary">
              {greeting}, {ownerName} 👋
            </h1>
          </div>
          <p className="text-xs text-ink-secondary mt-1 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-brand-600" />
            <span className="font-semibold text-ink-primary">
              {businessDisplayName}
            </span>
            <span>· Live Operations Center</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-page px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-slate-100 hover:text-ink-primary transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Setup Wizard
          </Link>
          <Link
            href="/ai-employees"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors"
          >
            <Bot className="h-4 w-4" /> Manage AI Employees
          </Link>
        </div>
      </div>

      {/* 2. Needs Your Attention Section (High Priority) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink-primary uppercase tracking-wider">
              Needs Your Attention
            </span>
            {pendingApprovals.length > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.2 text-[10px] font-bold text-white">
                {pendingApprovals.length}
              </span>
            )}
          </div>
          <Link
            href="/ai-employees"
            className="text-xs font-bold text-brand-600 hover:underline"
          >
            View all →
          </Link>
        </div>

        {pendingApprovals.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingApprovals.map((appr) => (
              <div
                key={appr.id}
                className="flex flex-col justify-between rounded-2xl border border-amber-300 bg-amber-50/70 p-4 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-900">
                      Approval Required
                    </span>
                    <span className="text-[10px] text-amber-800">
                      {formatDateTime(appr.requestedAt)}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-ink-primary mt-2">
                    {appr.title}
                  </h4>
                  <p className="text-[11px] text-ink-secondary mt-0.5 line-clamp-2">
                    {appr.description}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between pt-2 border-t border-amber-200/60">
                  <span className="text-[10px] font-semibold text-ink-muted">
                    Prepared by {appr.employee?.name || "AI Specialist"}
                  </span>
                  <Link
                    href={`/ai-employees/${appr.employeeId}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition-colors"
                  >
                    Review Action <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : pausedEmployees.length > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Pause className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink-primary">
                  {pausedEmployees.length} AI Employee is Paused
                </h4>
                <p className="text-[11px] text-ink-secondary">
                  {pausedEmployees.map((e) => e.name).join(", ")} will not execute actions until reactivated.
                </p>
              </div>
            </div>
            <Link
              href="/ai-employees"
              className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 border border-brand-200 hover:bg-brand-100"
            >
              Resume
            </Link>
          </div>
        ) : pendingTeamInvites.length > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-950">
                  {pendingTeamInvites.length} Team {pendingTeamInvites.length === 1 ? "Invitation" : "Invitations"} Waiting
                </h4>
                <p className="text-[11px] text-amber-800">
                  Staff member accounts are waiting for their first login.
                </p>
              </div>
            </div>
            <Link
              href="/team"
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors shadow-xs"
            >
              Review Team
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-emerald-950">
                All Systems Running Smoothly
              </h4>
              <p className="text-[11px] text-emerald-800">
                Your AI employees are autonomously handling inquiries. No pending approvals require action.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Today's Business Performance Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Assisted Sales
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-ink-primary">
              {totalOrdersAssisted > 0
                ? `$${(totalOrdersAssisted * 42).toLocaleString()}`
                : "$0"}
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            Generated with AI assistance
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Orders Assisted
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-ink-primary">
              {totalOrdersAssisted}
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            Orders guided to completion
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Conversations
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-ink-primary">
              {totalConversations}
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            Customer inquiries answered
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Accuracy Rate
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">
              {avgSuccessRate}%
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            {totalTasksCompleted} tasks completed
          </p>
        </div>
      </div>

      {/* 4. AI Employees Live Working Status */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
                Your AI Employees
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {activeEmployees.length} Working · {pausedEmployees.length} Paused
              </span>
            </div>
            <p className="text-xs text-ink-secondary mt-0.5">
              Active staff work 24/7. You can pause any employee immediately if needed.
            </p>
          </div>

          <Link
            href="/ai-employees"
            className="text-xs font-bold text-brand-600 hover:underline shrink-0"
          >
            Manage All Staff ({employees.length}) →
          </Link>
        </div>

        {employees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-8 text-center space-y-3">
            <Bot className="mx-auto h-8 w-8 text-ink-muted" />
            <div>
              <h4 className="text-sm font-bold text-ink-primary">
                No AI Employees Deployed Yet
              </h4>
              <p className="text-xs text-ink-secondary mt-0.5">
                Use the setup wizard to hire pre-configured staff tailored for your business.
              </p>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
            >
              <Sparkles className="h-3.5 w-3.5" /> Deploy AI Staff Now
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((emp) => {
              const isActive = emp.status === "ACTIVE";
              return (
                <div
                  key={emp.id}
                  className="flex flex-col justify-between rounded-xl border border-line bg-surface-page/50 p-4 transition-all hover:bg-white hover:shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            isActive
                              ? "bg-emerald-500 animate-pulse"
                              : "bg-slate-400"
                          }`}
                        />
                        <span
                          className={`text-xs font-bold ${
                            isActive ? "text-emerald-700" : "text-slate-600"
                          }`}
                        >
                          {isActive ? "Working" : "Paused"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          toggleStatus.mutate({
                            id: emp.id,
                            status: isActive ? "PAUSED" : "ACTIVE",
                          })
                        }
                        title={isActive ? "Click to Pause" : "Click to Activate"}
                        className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                          isActive
                            ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        }`}
                      >
                        {isActive ? "Pause" : "Activate"}
                      </button>
                    </div>

                    <h4 className="text-xs font-bold text-ink-primary mt-2 truncate">
                      {emp.name}
                    </h4>
                    <p className="text-[11px] text-ink-secondary truncate">
                      {emp.role} · {emp.department}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-2 border-t border-line/60">
                    <span className="text-[10px] text-ink-muted">
                      {emp.stats?.conversations || 0} chats handled
                    </span>
                    <Link
                      href={`/ai-employees/${emp.id}`}
                      className="text-[11px] font-bold text-brand-600 hover:underline"
                    >
                      Configure →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Recent Activity Stream & Quick Actions Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Activity Stream */}
        <div className="lg:col-span-2 rounded-2xl border border-line bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
              Recent Business Activity
            </h3>
            <span className="text-xs text-ink-muted">Live Feed</span>
          </div>

          {recentActivities.length === 0 ? (
            <p className="text-xs text-ink-muted py-6 text-center">
              No recent activity recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-line/60">
              {recentActivities.map((act) => (
                <div
                  key={act.id}
                  className="flex items-start justify-between py-3 first:pt-0 last:pb-0 gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Bot className="h-3 w-3" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-ink-primary block">
                        {act.action}
                      </span>
                      <p className="text-[11px] text-ink-secondary">
                        {act.details || act.employee?.name}
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] text-ink-muted shrink-0 whitespace-nowrap">
                    {formatDateTime(act.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions Card */}
        <div className="rounded-2xl border border-line bg-white p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
            Quick Actions
          </h3>

          <div className="space-y-2.5">
            <Link
              href="/knowledge-base"
              className="flex items-center justify-between rounded-xl border border-line p-3 hover:bg-surface-page transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-brand-600" />
                <span className="text-xs font-bold text-ink-primary">
                  Upload Price Lists &amp; Menus
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
            </Link>

            <Link
              href="/conversations"
              className="flex items-center justify-between rounded-xl border border-line p-3 hover:bg-surface-page transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-bold text-ink-primary">
                  View Customer Inquiries
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
            </Link>

            <Link
              href="/channels"
              className="flex items-center justify-between rounded-xl border border-line p-3 hover:bg-surface-page transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Smartphone className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-ink-primary">
                  Connect WhatsApp &amp; Chat
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
            </Link>

            <Link
              href="/locations"
              className="flex items-center justify-between rounded-xl border border-line p-3 hover:bg-surface-page transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-ink-primary">
                  Store &amp; Branch Locations
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
            </Link>

            <Link
              href="/team"
              className="flex items-center justify-between rounded-xl border border-line p-3 hover:bg-surface-page transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Users className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-bold text-ink-primary">
                  Team Members ({team.length})
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
