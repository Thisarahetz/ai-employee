"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Sparkles,
  ShieldAlert,
  Activity,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
  Building2,
  Filter,
} from "lucide-react";
import {
  useAiEmployees,
  useAiEmployeeStats,
  useAiEmployeeApprovals,
} from "@/lib/hooks/use-ai-employees";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { EmployeeCard } from "@/components/ai-employee/employee-card";
import { ApprovalCard } from "@/components/ai-employee/approval-card";
import { ActivityTimeline } from "@/components/ai-employee/activity-timeline";
import { OnboardingWizardModal } from "@/components/ai-employee/onboarding-wizard-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { getErrorMessage } from "@/lib/utils";

export default function AiEmployeesPage() {
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"EMPLOYEES" | "APPROVALS" | "ACTIVITY">(
    "EMPLOYEES"
  );
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const statsQuery = useAiEmployeeStats();
  const employeesQuery = useAiEmployees({
    department: selectedDept !== "ALL" ? selectedDept : undefined,
    branchId: selectedBranchId || undefined,
  });
  const pendingApprovalsQuery = useAiEmployeeApprovals("PENDING");
  const businessesQuery = useBusinesses();

  const employees = employeesQuery.data || [];
  const stats = statsQuery.data || {
    total: 0,
    active: 0,
    paused: 0,
    needsApproval: 0,
    errors: 0,
  };
  const pendingApprovals = pendingApprovalsQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">AI Employee Center</h1>
          <p className="text-sm text-ink-secondary">
            Manage, configure, and monitor autonomous AI employees across your business.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsWizardOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700 shadow-xs hover:bg-brand-100 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Templates &amp; Setup
          </button>

          <button
            type="button"
            onClick={() => setIsWizardOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Hire AI Employee
          </button>
        </div>
      </div>

      {/* Summary KPI Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-medium">Total AI Employees</span>
            <Users className="h-4 w-4 text-brand-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-primary">
            {stats.total}
          </div>
          <span className="text-[11px] text-ink-muted">Configured for your business</span>
        </div>

        <div className="rounded-xl border border-line bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-medium">Active</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {stats.active}
          </div>
          <span className="text-[11px] text-emerald-700 font-medium">Handling customer tasks</span>
        </div>

        <div className="rounded-xl border border-line bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-medium">Paused</span>
            <PauseCircle className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-700">
            {stats.paused}
          </div>
          <span className="text-[11px] text-ink-muted">Standby or off-duty</span>
        </div>

        <div
          onClick={() => setActiveTab("APPROVALS")}
          className={`cursor-pointer rounded-xl border p-4 shadow-xs transition-colors ${
            stats.needsApproval > 0
              ? "border-amber-300 bg-amber-50/50 hover:bg-amber-50"
              : "border-line bg-white"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-medium">Needs Approval</span>
            <ShieldAlert
              className={`h-4 w-4 ${
                stats.needsApproval > 0 ? "text-amber-700" : "text-ink-muted"
              }`}
            />
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${
              stats.needsApproval > 0 ? "text-amber-700" : "text-ink-primary"
            }`}
          >
            {stats.needsApproval}
          </div>
          <span
            className={`text-[11px] font-medium ${
              stats.needsApproval > 0 ? "text-amber-700" : "text-ink-muted"
            }`}
          >
            {stats.needsApproval > 0 ? "Actions awaiting sign-off" : "All actions approved"}
          </span>
        </div>
      </div>

      {/* Pending Approvals Warning Banner if any exist */}
      {pendingApprovals.length > 0 && activeTab !== "APPROVALS" && (
        <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950">
                {pendingApprovals.length} Action{pendingApprovals.length > 1 ? "s" : ""} Require Your Approval
              </h4>
              <p className="text-[11px] text-amber-900">
                AI employees prepared sensitive actions (e.g. stock reorders, refunds, price modifications) for your sign-off.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("APPROVALS")}
            className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors"
          >
            Review Now →
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("EMPLOYEES")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "EMPLOYEES"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-surface-page text-ink-secondary hover:bg-slate-200"
            }`}
          >
            AI Employees ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("APPROVALS")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "APPROVALS"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-surface-page text-ink-secondary hover:bg-slate-200"
            }`}
          >
            Approvals
            {stats.needsApproval > 0 && (
              <span className="rounded-full bg-amber-700 px-1.5 py-0.2 text-[10px] text-white">
                {stats.needsApproval}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ACTIVITY")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "ACTIVITY"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-surface-page text-ink-secondary hover:bg-slate-200"
            }`}
          >
            Activity Timeline
          </button>
        </div>

        {/* Filters (Branch & Department) */}
        {activeTab === "EMPLOYEES" && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Filter */}
            {businessesQuery.data && businessesQuery.data.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <Building2 className="h-3.5 w-3.5 text-ink-muted" />
                <select
                  aria-label="Filter by location"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                >
                  <option value="">All Locations / Branches</option>
                  {businessesQuery.data.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Department Filter */}
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <Filter className="h-3.5 w-3.5 text-ink-muted" />
              <select
                aria-label="Filter by department"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
              >
                <option value="ALL">All Departments</option>
                <option value="Sales">Sales</option>
                <option value="Customer Support">Customer Support</option>
                <option value="Inventory">Inventory</option>
                <option value="Operations">Operations</option>
                <option value="Finance">Finance</option>
                <option value="Marketing">Marketing</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: EMPLOYEES GRID */}
      {activeTab === "EMPLOYEES" && (
        <>
          {employeesQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
          ) : employeesQuery.isError ? (
            <ErrorState
              message={getErrorMessage(employeesQuery.error, "Unable to load AI employees.")}
              onRetry={() => employeesQuery.refetch()}
            />
          ) : employees.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white p-12 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-4">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-ink-primary">
                No AI Employees Deployed Yet
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-secondary">
                Set up AI employees tailored to your business in seconds using our guided onboarding wizard.
              </p>
              <button
                type="button"
                onClick={() => setIsWizardOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Launch Business Setup Wizard
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {employees.map((emp) => (
                <EmployeeCard key={emp.id} employee={emp} />
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 2: APPROVALS FEED */}
      {activeTab === "APPROVALS" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-primary">
              Owner Action Approvals
            </h3>
            <span className="text-xs text-ink-secondary">
              Level 2 actions waiting for your authorization
            </span>
          </div>

          {pendingApprovalsQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-10 text-center text-xs text-ink-muted">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
              <p className="font-semibold text-ink-primary">All caught up!</p>
              <p className="mt-0.5">No actions currently pending owner approval.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map((appr) => (
                <ApprovalCard key={appr.id} approval={appr} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ACTIVITY HISTORY */}
      {activeTab === "ACTIVITY" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-primary">
              Live AI Activity Stream
            </h3>
            <span className="text-xs text-ink-secondary">
              Real-time audit log of customer consultations, stock alerts, and orders
            </span>
          </div>

          <ActivityTimeline />
        </div>
      )}

      {/* Onboarding Wizard Modal */}
      <OnboardingWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => {
          employeesQuery.refetch();
          statsQuery.refetch();
        }}
      />
    </div>
  );
}
