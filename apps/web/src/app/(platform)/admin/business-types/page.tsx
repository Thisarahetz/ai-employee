"use client";

import Link from "next/link";
import { Building2, CheckCircle2, Layers, MessageSquare, RefreshCw, Sparkles } from "lucide-react";

import { useAdminBusinessTypes } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminBusinessTypesPage() {
  const businessTypesQuery = useAdminBusinessTypes();
  const businessTypes = businessTypesQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Supported Business Types</h1>
            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
              {businessTypes.length} Industries
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Standard business verticals supported by the platform, including recommended channels and AI templates.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => businessTypesQuery.refetch()}
          isLoading={businessTypesQuery.isFetching}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Grid of Business Types */}
      {businessTypesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-page" />
          ))}
        </div>
      ) : businessTypesQuery.isError ? (
        <ErrorState
          message={getErrorMessage(businessTypesQuery.error, "Unable to load business types.")}
          onRetry={() => businessTypesQuery.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businessTypes.map((type) => (
            <Card key={type.id} className="hover:shadow-md transition-shadow p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 font-bold">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-ink-primary">{type.name}</h3>
                      <span className="text-[11px] font-medium text-ink-muted">{type.category}</span>
                    </div>
                  </div>
                  <Badge color="green">{type.activeCount} Active</Badge>
                </div>

                <p className="mt-3 text-xs text-ink-secondary">{type.description}</p>

                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <span className="font-semibold text-[11px] text-ink-primary">Recommended Channels:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {type.recommendedChannels.map((ch, idx) => (
                        <span key={idx} className="rounded bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="font-semibold text-[11px] text-ink-primary">Default Blueprints:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {type.defaultTemplates.map((tmpl, idx) => (
                        <Link
                          key={idx}
                          href="/admin/ai-templates"
                          className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:underline"
                        >
                          {tmpl}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-line pt-3 flex items-center justify-between text-xs">
                <Link
                  href={`/admin/tenants?search=${type.id.toLowerCase()}`}
                  className="font-medium text-brand-600 hover:underline"
                >
                  View {type.activeCount} Tenants →
                </Link>
                <Link href="/admin/ai-templates" className="text-ink-muted hover:text-ink-primary">
                  Inspect Templates
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
