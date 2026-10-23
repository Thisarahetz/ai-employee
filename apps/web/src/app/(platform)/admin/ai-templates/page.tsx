"use client";

import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Eye,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { useAdminAiTemplates } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import type { AdminBusinessTemplate } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";

const CATEGORIES = ["ALL", "Retail", "Services", "Hospitality", "Healthcare", "Trade", "Corporate"];

export default function AdminAiTemplatesPage() {
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [inspectTemplate, setInspectTemplate] = useState<AdminBusinessTemplate | null>(null);

  const templatesQuery = useAdminAiTemplates();

  const templates = templatesQuery.data ?? [];

  const filtered = templates.filter((t) => {
    const matchesCategory = selectedCategory === "ALL" || t.category === selectedCategory;
    const matchesSearch =
      !search.trim() ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">AI Template Registry</h1>
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {templates.length} Pre-built Blueprints
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Global catalog of pre-configured AI employee roles, workflows, and prompts ready for tenant deployment.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => templatesQuery.refetch()}
          isLoading={templatesQuery.isFetching}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "bg-white border border-line text-ink-secondary hover:text-ink-primary hover:bg-surface-page"
              }`}
            >
              {cat === "ALL" ? "All Categories" : cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Templates Grid */}
      {templatesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-page" />
          ))}
        </div>
      ) : templatesQuery.isError ? (
        <ErrorState
          message={getErrorMessage(templatesQuery.error, "Unable to load AI templates.")}
          onRetry={() => templatesQuery.refetch()}
        />
      ) : !filtered.length ? (
        <Card className="p-8">
          <EmptyState
            title="No templates match"
            description="Try changing the category filter or search query."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tmpl) => (
            <Card key={tmpl.id} className="hover:shadow-md transition-shadow flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-ink-primary">{tmpl.name}</h3>
                      <span className="text-[11px] font-medium text-ink-muted">{tmpl.category}</span>
                    </div>
                  </div>
                  <Badge color="blue">{tmpl.suggestedEmployeesCount} Agents</Badge>
                </div>

                <p className="mt-3 text-xs text-ink-secondary line-clamp-3">{tmpl.description}</p>
              </div>

              <div className="mt-5 border-t border-line pt-3 flex items-center justify-between text-xs">
                <span className="text-ink-muted">
                  Adoption: <strong className="text-ink-primary">{tmpl.adoptionCount}</strong> businesses
                </span>
                <Button variant="secondary" size="sm" onClick={() => setInspectTemplate(tmpl)}>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Inspect
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Inspect Template Modal */}
      {inspectTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-label="Template details" className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink-primary">{inspectTemplate.name} Blueprint</h3>
                  <p className="text-xs text-ink-secondary">
                    {inspectTemplate.category} Category · {inspectTemplate.suggestedEmployeesCount} Pre-built AI
                    Employees
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectTemplate(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-page hover:text-ink-primary"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Description</h4>
              <p className="mt-1 text-xs text-ink-primary">{inspectTemplate.description}</p>
            </div>

            {/* Suggested Employees List */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Pre-configured AI Employees in this Blueprint
              </h4>

              <div className="space-y-3">
                {inspectTemplate.suggestedEmployees.map((emp) => (
                  <div key={emp.key} className="rounded-xl border border-line bg-surface-page/50 p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 font-bold">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div>
                          <h5 className="font-semibold text-xs text-ink-primary">{emp.name}</h5>
                          <p className="text-[11px] text-ink-muted">
                            {emp.role} · {emp.department} · {emp.businessFunction}
                          </p>
                        </div>
                      </div>
                      <span className="rounded bg-white border border-line px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                        {emp.actionLevel}
                      </span>
                    </div>

                    <p className="text-xs text-ink-secondary">{emp.description}</p>

                    <div>
                      <span className="text-[11px] font-semibold text-ink-primary">Assigned Tasks:</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {emp.assignedTasks.map((t, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-white border border-line px-2 py-0.5 text-[10px] text-ink-secondary"
                          >
                            {t.category}: {t.task}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-ink-primary">System Prompt Preview:</span>
                      <div className="mt-1 rounded bg-white border border-line p-2 text-[10px] font-mono text-ink-primary max-h-24 overflow-y-auto whitespace-pre-wrap">
                        {emp.systemPrompt}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-line">
              <Button variant="secondary" onClick={() => setInspectTemplate(null)}>
                Close Blueprint
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
