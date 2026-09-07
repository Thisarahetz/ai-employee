"use client";

import React, { useState } from "react";
import {
  Clock,
  Bot,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Filter,
  Layers,
} from "lucide-react";
import { AiEmployeeActivity } from "@/lib/types";
import { useAiEmployeeActivities } from "@/lib/hooks/use-ai-employees";

interface ActivityTimelineProps {
  employeeId?: string;
}

export function ActivityTimeline({ employeeId }: ActivityTimelineProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const activitiesQuery = useAiEmployeeActivities({
    employeeId,
    category: selectedCategory || undefined,
  });

  const activities = activitiesQuery.data || [];

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "CUSTOMER":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "SALES":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "INVENTORY":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "FINANCE":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
      case "PENDING_APPROVAL":
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
      case "REJECTED":
        return <XCircle className="h-3.5 w-3.5 text-red-600" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Category filter pills if viewing global activities */}
      {!employeeId && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-line">
          <span className="text-xs font-semibold text-ink-muted mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filter:
          </span>
          {["", "CUSTOMER", "SALES", "INVENTORY", "FINANCE", "OPERATIONS"].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                selectedCategory === cat
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-surface-page text-ink-secondary hover:bg-slate-200"
              }`}
            >
              {cat === "" ? "All Categories" : cat}
            </button>
          ))}
        </div>
      )}

      {activitiesQuery.isLoading ? (
        <div className="space-y-3 p-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-page" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center text-xs text-ink-muted">
          No activity recorded yet. As your AI employees answer questions and complete tasks, events will stream here.
        </div>
      ) : (
        <div className="relative border-l-2 border-line/80 ml-4 space-y-4 py-2">
          {activities.map((act) => (
            <div key={act.id} className="relative pl-6">
              {/* Dot on the timeline */}
              <div className="absolute -left-2.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white border border-line shadow-xs">
                {getStatusIcon(act.status)}
              </div>

              <div className="rounded-xl border border-line bg-white p-3.5 shadow-xs transition-hover hover:border-brand-200">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-ink-primary">
                      {act.action}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${getCategoryBadge(
                        act.category
                      )}`}
                    >
                      {act.category}
                    </span>
                  </div>

                  <span className="text-[10px] text-ink-muted">
                    {new Date(act.createdAt).toLocaleString([], {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>

                <p className="text-xs text-ink-secondary">{act.details}</p>

                {act.employee && !employeeId && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-ink-muted">
                    <Bot className="h-3 w-3 text-brand-600" />
                    <span>{act.employee.name}</span>
                    <span>·</span>
                    <span>{act.employee.role}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
