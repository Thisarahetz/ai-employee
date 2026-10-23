"use client";

import Link from "next/link";
import { Check, CreditCard, RefreshCw, Sparkles, Users } from "lucide-react";

import { useAdminPlans } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminPlansPage() {
  const plansQuery = useAdminPlans();
  const plans = plansQuery.data ?? [];

  const totalTenants = plans.reduce((acc, p) => acc + p.tenantCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Subscriptions & Plans</h1>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              {plans.length} Tiers Configured
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            SaaS subscription packages, quota limits, pricing rules, and current tenant subscription distribution.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => plansQuery.refetch()}
          isLoading={plansQuery.isFetching}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Plan Cards Grid */}
      {plansQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-surface-page" />
          ))}
        </div>
      ) : plansQuery.isError ? (
        <ErrorState
          message={getErrorMessage(plansQuery.error, "Unable to load subscription plans.")}
          onRetry={() => plansQuery.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const percentage = totalTenants > 0 ? Math.round((plan.tenantCount / totalTenants) * 100) : 0;
            return (
              <Card
                key={plan.id}
                className={`flex flex-col justify-between p-5 hover:shadow-md transition-shadow ${
                  plan.id === "pro" ? "border-brand-500 ring-1 ring-brand-500" : ""
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-ink-primary">{plan.name}</h3>
                      <p className="text-xs text-ink-muted mt-0.5">{plan.description}</p>
                    </div>
                    <Badge color={plan.id === "pro" ? "purple" : "blue"}>{plan.badge}</Badge>
                  </div>

                  {/* Pricing */}
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold tracking-tight text-ink-primary">
                      ${plan.priceMonthlyUsd}
                    </span>
                    <span className="text-xs text-ink-muted">/ month</span>
                  </div>

                  {/* Tenant Count Badge */}
                  <div className="mt-3 rounded-lg bg-surface-page p-2.5 text-xs flex items-center justify-between">
                    <span className="text-ink-secondary">Subscribed Businesses:</span>
                    <strong className="text-ink-primary">
                      {plan.tenantCount} ({percentage}%)
                    </strong>
                  </div>

                  {/* Feature Limits List */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-ink-secondary">
                      <Check className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>
                        Up to <strong>{plan.limits.maxBranches}</strong> branch location(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-secondary">
                      <Check className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>
                        Up to <strong>{plan.limits.maxAiEmployees}</strong> AI employees
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-secondary">
                      <Check className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>
                        Up to <strong>{plan.limits.maxTeamMembers}</strong> team members
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-secondary">
                      <Check className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>
                        <strong>{plan.limits.messagesPerMonth.toLocaleString()}</strong> monthly messages
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-secondary">
                      <Check className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>
                        <strong>{plan.limits.knowledgeDocs}</strong> knowledge base documents
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-secondary">
                      <Check className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>{plan.limits.support} support</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-line pt-3">
                  <Link
                    href={`/admin/tenants?plan=${plan.id}`}
                    className="block text-center rounded-lg bg-surface-page py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
                  >
                    View {plan.tenantCount} Businesses on this plan →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
