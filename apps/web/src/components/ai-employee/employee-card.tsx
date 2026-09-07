"use client";

import React from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  PauseCircle,
  Building2,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { AiEmployee } from "@/lib/types";
import { useToggleEmployeeStatus } from "@/lib/hooks/use-ai-employees";

interface EmployeeCardProps {
  employee: AiEmployee;
}

export function EmployeeCard({ employee }: EmployeeCardProps) {
  const toggleStatus = useToggleEmployeeStatus();
  const isActive = employee.status === "ACTIVE";

  const getDepartmentColor = (dept: string) => {
    switch (dept.toLowerCase()) {
      case "sales":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "customer support":
        return "bg-teal-50 text-teal-700 border-teal-200";
      case "inventory":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "operations":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "finance":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "marketing":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getActionLevelBadge = (level: string) => {
    switch (level) {
      case "APPROVAL_REQUIRED":
        return (
          <span className="rounded bg-amber-100/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
            Level 2 · Needs Approval
          </span>
        );
      case "OWNER_ONLY":
        return (
          <span className="rounded bg-red-100/70 px-2 py-0.5 text-[10px] font-semibold text-red-800 border border-red-200">
            Level 3 · Restricted
          </span>
        );
      default:
        return (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
            Level 1 · Automatic
          </span>
        );
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleStatus.mutate({
      id: employee.id,
      status: isActive ? "PAUSED" : "ACTIVE",
    });
  };

  const activeTaskCount =
    employee.assignedTasks?.filter((t) => t.isEnabled)?.length ?? 0;

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border bg-white p-5 shadow-xs transition-all hover:shadow-md ${
        isActive
          ? "border-line hover:border-brand-300"
          : "border-line/60 bg-surface-page/50 opacity-80"
      }`}
    >
      <div>
        {/* Top bar: Avatar + Name + Toggle Switch */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold shadow-xs ${
                isActive ? "bg-brand-600 text-white" : "bg-slate-300 text-slate-600"
              }`}
            >
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-ink-primary leading-snug">
                  {employee.name}
                </h3>
              </div>
              <p className="text-xs text-ink-secondary font-medium">
                {employee.role}
              </p>
            </div>
          </div>

          {/* Status Toggle Switch */}
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={handleToggle}
              disabled={toggleStatus.isPending}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                isActive ? "bg-emerald-600" : "bg-slate-300"
              }`}
              title={isActive ? "Click to Pause" : "Click to Activate"}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  isActive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isActive ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              {isActive ? "ACTIVE" : "PAUSED"}
            </span>
          </div>
        </div>

        {/* Badges: Department + Action Level + Branch Scope */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold border ${getDepartmentColor(
              employee.department
            )}`}
          >
            {employee.department}
          </span>
          {getActionLevelBadge(employee.actionLevel)}
          <span className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
            <Building2 className="h-2.5 w-2.5" />
            {employee.scope === "ALL_BRANCHES"
              ? "All Locations"
              : `${employee.branchIds?.length || 0} Locations`}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-ink-secondary line-clamp-2 mb-4">
          {employee.description}
        </p>

        {/* Responsibilities list snippet */}
        {employee.responsibilities && employee.responsibilities.length > 0 && (
          <div className="mb-4 rounded-lg bg-surface-page p-2.5 border border-line/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">
              Core Responsibilities
            </span>
            <ul className="space-y-1 text-[11px] text-ink-secondary">
              {employee.responsibilities.slice(0, 2).map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-brand-600 font-bold">•</span>
                  <span className="truncate">{r}</span>
                </li>
              ))}
              {employee.responsibilities.length > 2 && (
                <li className="text-[10px] text-ink-muted italic pl-3">
                  +{employee.responsibilities.length - 2} more duties
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Footer / Metrics & Link */}
      <div className="pt-3 border-t border-line/60 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-ink-secondary">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
            <strong className="text-ink-primary font-semibold">{activeTaskCount}</strong> tasks
          </span>
          {employee.stats?.successRate && (
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <strong className="text-ink-primary font-semibold">
                {employee.stats.successRate}%
              </strong>{" "}
              success
            </span>
          )}
        </div>

        <Link
          href={`/ai-employees/${employee.id}`}
          className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
        >
          Manage <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
