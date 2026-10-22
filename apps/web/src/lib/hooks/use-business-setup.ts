import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// ── Automation rules ───────────────────────────────────────────────────────

export interface RuleCondition {
  field: string;
  op: "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "exists" | "not_exists" | "in";
  value?: unknown;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerEvent: string;
  conditions: RuleCondition[];
  actionType: "CREATE_TASK" | "NOTIFY_OWNER";
  employeeId: string | null;
  employee?: { id: string; name: string; role: string; status: string } | null;
  taskTitle: string;
  taskDescription: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dedupeKey: string | null;
  cooldownSeconds: number;
  maxRunsPerHour: number;
  allowAiTriggered: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  lastError: string | null;
  templateKey: string | null;
}

export interface AutomationRun {
  id: string;
  eventType: string;
  dedupeValue: string | null;
  status: string;
  taskId: string | null;
  message: string;
  createdAt: string;
}

export type RuleInput = Partial<Omit<AutomationRule, "id" | "employee" | "triggerCount" | "lastTriggeredAt" | "lastError" | "templateKey">>;

export function useAutomationTriggers() {
  return useQuery({
    queryKey: ["automations", "triggers"],
    queryFn: async () => (await apiClient.get<{ builtIn: string[]; externalPattern: string }>("/ai-workforce/automations/triggers")).data,
    staleTime: Infinity,
  });
}

export function useAutomations() {
  return useQuery({
    queryKey: ["automations"],
    queryFn: async () => (await apiClient.get<AutomationRule[]>("/ai-workforce/automations")).data,
  });
}

export function useAutomationRuns(id: string | null) {
  return useQuery({
    queryKey: ["automations", id, "runs"],
    queryFn: async () => (await apiClient.get<AutomationRun[]>(`/ai-workforce/automations/${id}/runs`)).data,
    enabled: Boolean(id),
    refetchInterval: 15000,
  });
}

export function useSaveAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: RuleInput & { id?: string }) =>
      id
        ? (await apiClient.patch<AutomationRule>(`/ai-workforce/automations/${id}`, body)).data
        : (await apiClient.post<AutomationRule>("/ai-workforce/automations", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/ai-workforce/automations/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });
}

export function useTestAutomation() {
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      (await apiClient.post<{ matches: boolean; conditions: (RuleCondition & { matched: boolean })[]; title: string; description: string; dedupeValue: string | null }>(
        `/ai-workforce/automations/${id}/test`,
        { payload },
      )).data,
  });
}

// ── Business profile & templates ───────────────────────────────────────────

export interface BusinessProfileData {
  businessId: string;
  name: string;
  type: string;
  timezone: string;
  industryTemplateKey: string | null;
  profile: { description?: string; services?: string; hours?: string; brandVoice?: string; policies?: string; departments?: string[]; goals?: string[] };
}

export function useBusinessProfile() {
  return useQuery({
    queryKey: ["business-setup", "profile"],
    queryFn: async () => (await apiClient.get<BusinessProfileData>("/business-setup/profile")).data,
  });
}

export function useUpdateBusinessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<BusinessProfileData["profile"]> & { timezone?: string }) =>
      (await apiClient.put<BusinessProfileData>("/business-setup/profile", body)).data,
    onSuccess: (data) => qc.setQueryData(["business-setup", "profile"], data),
  });
}

export interface TemplateDetail {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string;
  owner: "platform" | "business";
  basedOnKey: string | null;
  version: number;
  definition: unknown;
}

export function useTemplateDetail(id: string | null) {
  return useQuery({
    queryKey: ["business-setup", "templates", id],
    queryFn: async () => (await apiClient.get<TemplateDetail>(`/business-setup/templates/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCopyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { basedOnId: string; name?: string }) => (await apiClient.post<TemplateDetail>("/business-setup/templates", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-setup", "templates"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; description?: string; definition?: unknown }) =>
      (await apiClient.patch<TemplateDetail>(`/business-setup/templates/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-setup", "templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/business-setup/templates/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-setup", "templates"] }),
  });
}

// ── AI provider keys ──────────────────────────────────────────────────────

export interface ProviderKeyStatus {
  provider: "OPENAI" | "ANTHROPIC" | "GEMINI";
  hasOwnKey: boolean;
  keyHint: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  platformKeyAvailable: boolean;
}

export function useProviderKeys() {
  return useQuery({
    queryKey: ["ai-config", "provider-keys"],
    queryFn: async () => (await apiClient.get<{ platformKeysAllowed: boolean; providers: ProviderKeyStatus[] }>("/ai-config/provider-keys")).data,
  });
}

export function useSaveProviderKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      (await apiClient.put(`/ai-config/provider-keys/${provider}`, { apiKey })).data,
    onSuccess: (data) => qc.setQueryData(["ai-config", "provider-keys"], data),
  });
}

export function useDeleteProviderKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => (await apiClient.delete(`/ai-config/provider-keys/${provider}`)).data,
    onSuccess: (data) => qc.setQueryData(["ai-config", "provider-keys"], data),
  });
}

// ── Platform admin monitoring ─────────────────────────────────────────────

export interface AdminAiUsage {
  days: number;
  totals: { costUsd: number; costTodayUsd: number; costMonthUsd: number; calls: number; inputTokens: number; outputTokens: number; activeTenants: number; tenantsWithOwnKeys: number };
  daily: { date: string; costUsd: number; calls: number }[];
  byModel: { provider: string; model: string; costUsd: number; calls: number }[];
  byTenant: {
    tenantId: string;
    name: string;
    slug: string | null;
    costUsd: number;
    costTodayUsd: number;
    costMonthUsd: number;
    calls: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksBlocked: number;
    aiEnabled: boolean;
    monthlyBudgetUsd: number | null;
    monthlyBudgetUsedPct: number | null;
    usesOwnKeys: boolean;
  }[];
}

export interface AdminSystemHealth {
  status: "healthy" | "degraded";
  issues: string[];
  database: string;
  queue: Record<string, number> | null;
  tasks: { running: number; staleRunning: number; overdueQueued: number; failedLast24h: number; blockedByLimits: number };
  schedulesAutoDisabledLast7d: number;
  automationRulesWithErrors: number;
  recentFailures: { id: string; title: string; error: string | null; updatedAt: string; attempts: number; tenant: { name: string; slug: string } }[];
}

export function useAdminAiUsage(days: number) {
  return useQuery({
    queryKey: ["admin", "ai-usage", days],
    queryFn: async () => (await apiClient.get<AdminAiUsage>(`/admin/ai-usage?days=${days}`)).data,
    refetchInterval: 60000,
  });
}

export function useAdminSystemHealth() {
  return useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: async () => (await apiClient.get<AdminSystemHealth>("/admin/system-health")).data,
    refetchInterval: 30000,
  });
}

export function useAdminSetTenantAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, ...patch }: { tenantId: string; aiEnabled?: boolean; monthlyBudgetUsd?: number | null }) =>
      (await apiClient.put(`/admin/tenants/${tenantId}/ai-limits`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "ai-usage"] }),
  });
}
