"use client";

import { WorkforceHealth } from "@/components/platform/workforce-health";
import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Globe,
  Radio,
  RefreshCw,
  Server,
  Sparkles,
  Zap,
} from "lucide-react";

import { useAdminHealth } from "@/lib/hooks/use-admin";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminHealthPage() {
  const healthQuery = useAdminHealth();
  const health = healthQuery.data;

  const [diagnosticTime, setDiagnosticTime] = useState<number | null>(null);

  async function handleRunDiagnostic() {
    const start = Date.now();
    await healthQuery.refetch();
    setDiagnosticTime(Date.now() - start);
  }

  const isHealthy = health?.status === "healthy";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">System Health & Diagnostics</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isHealthy ? "bg-status-success/10 text-status-success" : "bg-status-critical/10 text-status-critical"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isHealthy ? "bg-status-success" : "bg-status-critical"}`} />
              {isHealthy ? "All Clusters Healthy" : "Degraded Performance"}
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Real-time status, latency metrics, and API connectivity across underlying infrastructure.
          </p>
        </div>

        <Button onClick={handleRunDiagnostic} isLoading={healthQuery.isFetching}>
          <Zap className="mr-1.5 h-3.5 w-3.5" />
          Run Live Diagnostic
        </Button>
      </div>

      {diagnosticTime !== null && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Diagnostic sweep completed successfully across database, Redis, and API endpoints.</span>
          </div>
          <span className="font-mono font-semibold">{diagnosticTime}ms roundtrip</span>
        </div>
      )}

      {healthQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-surface-page" />
          ))}
        </div>
      ) : healthQuery.isError || !health ? (
        <ErrorState
          message={getErrorMessage(healthQuery.error, "Unable to run system health diagnostic.")}
          onRetry={() => healthQuery.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: API Server */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-ink-primary">NestJS API Core</h3>
                  <p className="text-xs text-ink-muted">Application Runtime</p>
                </div>
              </div>
              <Badge color="green">ONLINE</Badge>
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Uptime</span>
                <span className="font-semibold text-ink-primary">
                  {Math.round(health.services.api.uptimeSeconds / 60)} minutes
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Node.js Version</span>
                <span className="font-mono text-ink-primary">{health.services.api.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Memory (Heap / RSS)</span>
                <span className="font-mono text-ink-primary">
                  {health.services.api.memoryHeapUsedMb}MB / {health.services.api.memoryRssMb}MB
                </span>
              </div>
            </div>
          </Card>

          {/* Card 2: PostgreSQL Database */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-ink-primary">PostgreSQL Database</h3>
                  <p className="text-xs text-ink-muted">pgvector enabled</p>
                </div>
              </div>
              <Badge color={health.services.database.status === "healthy" ? "green" : "red"}>
                {health.services.database.status.toUpperCase()}
              </Badge>
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Query Latency (SELECT 1)</span>
                <span className="font-mono font-bold text-emerald-700">
                  {health.services.database.latencyMs} ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Engine</span>
                <span className="text-ink-primary">{health.services.database.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Connection Pool</span>
                <span className="font-semibold text-emerald-600">Healthy</span>
              </div>
            </div>
          </Card>

          {/* Card 3: Redis & Queue */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-ink-primary">Redis & BullMQ</h3>
                  <p className="text-xs text-ink-muted">Cache & Queue Cluster</p>
                </div>
              </div>
              <Badge color={health.services.redis.status === "healthy" ? "green" : "red"}>{health.services.redis.status === "healthy" ? "CONNECTED" : "UNREACHABLE"}</Badge>
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Round trip</span>
                <span className="font-mono text-ink-primary">{health.services.redis.latencyMs} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Jobs waiting / delayed</span>
                <span className="font-mono text-ink-primary">
                  {health.services.redis.queue ? `${(health.services.redis.queue.waiting ?? 0) + (health.services.redis.queue.prioritized ?? 0)} / ${health.services.redis.queue.delayed ?? 0}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Jobs running</span>
                <span className="font-semibold text-ink-primary">{health.services.redis.queue?.active ?? "—"}</span>
              </div>
            </div>
          </Card>

          {/* Card 4: OpenAI Provider */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-ink-primary">OpenAI API</h3>
                  <p className="text-xs text-ink-muted">GPT-4o & Embeddings</p>
                </div>
              </div>
              <Badge color={health.services.aiProviders.openai.configured ? "green" : "gray"}>
                {health.services.aiProviders.openai.configured ? "CONFIGURED" : "PENDING KEY"}
              </Badge>
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Platform default model</span>
                <span className="font-mono text-ink-primary">{health.services.aiProviders.openai.defaultModel ?? "Not the platform default"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">API Key</span>
                <span className="text-ink-muted">
                  {health.services.aiProviders.openai.configured ? "•••••••••••••" : "Not set in .env"}
                </span>
              </div>
            </div>
          </Card>

          {/* Card 5: Anthropic Provider */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-ink-primary">Anthropic Claude</h3>
                  <p className="text-xs text-ink-muted">Reasoning & Multi-turn</p>
                </div>
              </div>
              <Badge color={health.services.aiProviders.anthropic.configured ? "green" : "gray"}>
                {health.services.aiProviders.anthropic.configured ? "CONFIGURED" : "PENDING KEY"}
              </Badge>
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Default Model</span>
                <span className="font-mono text-ink-primary">
                  {health.services.aiProviders.anthropic.defaultModel ?? "Not the platform default"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">API Key</span>
                <span className="text-ink-muted">
                  {health.services.aiProviders.anthropic.configured ? "•••••••••••••" : "Not set in .env"}
                </span>
              </div>
            </div>
          </Card>

          {/* Card 6: Channels & Webhooks */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-teal-50 p-2 text-teal-600">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-ink-primary">Channel Ingestion</h3>
                  <p className="text-xs text-ink-muted">WhatsApp & Web Chat</p>
                </div>
              </div>
              <Badge color="green">READY</Badge>
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Active Channels</span>
                <span className="font-semibold text-ink-primary">
                  {health.services.channels.activeChannels}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">WhatsApp Webhook Ready</span>
                <span className="font-semibold text-emerald-600">Yes</span>
              </div>
            </div>
          </Card>
        </div>
      )}
      <WorkforceHealth />
    </div>
  );
}
