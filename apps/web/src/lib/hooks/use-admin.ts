"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type {
  ReplyMode,
  AdminAiEmployee,
  AdminBusinessTemplate,
  AdminBusinessType,
  AdminHealthStatus,
  AdminPlan,
  AdminPlatformSettings,
  AdminTenant,
  AdminUsageStats,
  AdminUser,
  AdminUserDetail,
  CreateTenantInput,
  CreateTenantResult,
  PaginatedResponse,
  PlatformAuditEntry,
  PlatformStats,
  TenantMembership,
  TenantStatus,
  UpdateUserInput,
} from "@/lib/types";

export interface AdminListParams {
  search?: string;
  status?: string;
  plan?: string;
  actionLevel?: string;
  page?: number;
  pageSize?: number;
}

function listParams({ search, status, plan, actionLevel, page, pageSize }: AdminListParams) {
  const params: Record<string, string | number> = {};
  if (search) params.search = search;
  if (status) params.status = status;
  if (plan) params.plan = plan;
  if (actionLevel) params.actionLevel = actionLevel;
  if (page) params.page = page;
  if (pageSize) params.pageSize = pageSize;
  return params;
}

/** High-level overview KPIs for the Platform Admin Dashboard. */
export function usePlatformStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => (await apiClient.get<PlatformStats>("/admin/stats")).data,
    refetchInterval: 15_000,
  });
}

export function useAdminTenants(params: AdminListParams = {}) {
  return useQuery({
    queryKey: ["admin", "tenants", params],
    queryFn: async () =>
      (await apiClient.get<PaginatedResponse<AdminTenant>>("/admin/tenants", { params: listParams(params) })).data,
  });
}

export function useAdminTenant(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "tenants", tenantId],
    queryFn: async () => (await apiClient.get<AdminTenant>(`/admin/tenants/${tenantId}`)).data,
    enabled: !!tenantId,
  });
}

export function useAdminTenantUsers(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "tenants", tenantId, "users"],
    queryFn: async () => (await apiClient.get<TenantMembership[]>(`/admin/tenants/${tenantId}/users`)).data,
    enabled: !!tenantId,
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) =>
      (await apiClient.delete<{ success: boolean; message: string }>(`/admin/tenants/${tenantId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
    },
  });
}

/** Platform-wide user list — every global identity, not scoped to a tenant. */
export function useAdminUsers(params: AdminListParams = {}) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: async () =>
      (await apiClient.get<PaginatedResponse<AdminUser>>("/admin/users", { params: listParams(params) })).data,
  });
}

export function useAdminUser(userId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "users", userId],
    queryFn: async () => (await apiClient.get<AdminUserDetail>(`/admin/users/${userId}`)).data,
    enabled: !!userId,
  });
}

/** Cross-tenant list of all AI employees across every business. */
export function useAdminAiEmployees(params: AdminListParams = {}) {
  return useQuery({
    queryKey: ["admin", "ai-employees", params],
    queryFn: async () =>
      (await apiClient.get<PaginatedResponse<AdminAiEmployee>>("/admin/ai-employees", { params: listParams(params) })).data,
  });
}

/** Override/pause an AI employee across any tenant. */
export function useUpdateAdminAiEmployeeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await apiClient.patch<AdminAiEmployee>(`/admin/ai-employees/${id}/status`, { status })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai-employees"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
    },
  });
}

/** Predefined templates catalog by industry. */
export function useAdminAiTemplates() {
  return useQuery({
    queryKey: ["admin", "ai-templates"],
    queryFn: async () => (await apiClient.get<AdminBusinessTemplate[]>("/admin/ai-templates")).data,
  });
}

/** Supported business industries catalog. */
export function useAdminBusinessTypes() {
  return useQuery({
    queryKey: ["admin", "business-types"],
    queryFn: async () => (await apiClient.get<AdminBusinessType[]>("/admin/business-types")).data,
  });
}

/** Platform subscription plans and current distribution. */
export function useAdminPlans() {
  return useQuery({
    queryKey: ["admin", "plans"],
    queryFn: async () => (await apiClient.get<AdminPlan[]>("/admin/plans")).data,
  });
}

/** PATCH /admin/plans/:id/reply-modes — which reply modes a plan allows. */
export function useSetPlanReplyModes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, allowedReplyModes }: { id: string; allowedReplyModes: ReplyMode[] }) =>
      (await apiClient.patch(`/admin/plans/${id}/reply-modes`, { allowedReplyModes })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

/** Platform usage and volume metrics. */
export function useAdminUsage() {
  return useQuery({
    queryKey: ["admin", "usage"],
    queryFn: async () => (await apiClient.get<AdminUsageStats>("/admin/usage")).data,
  });
}

/** Live system health, round-trip database latency, and service availability. */
export function useAdminHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: async () => (await apiClient.get<AdminHealthStatus>("/admin/health")).data,
    refetchInterval: 30_000,
  });
}

/** Global platform settings. */
export function useAdminSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => (await apiClient.get<AdminPlatformSettings>("/admin/settings")).data,
  });
}


export function useAdminAuditLog(params: { targetType?: string; targetId?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["admin", "audit-log", params],
    queryFn: async () =>
      (await apiClient.get<PaginatedResponse<PlatformAuditEntry>>("/admin/audit-log", { params })).data,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTenantInput) =>
      (await apiClient.post<CreateTenantResult>("/admin/tenants", input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

/** General tenant management — any of name/plan/status in one call. */
export function useUpdateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: string; name?: string; plan?: string; status?: TenantStatus }) =>
      (await apiClient.patch<AdminTenant>(`/admin/tenants/${id}`, data)).data,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
    },
  });
}

/** Grant/revoke platform access, enable/disable an account. */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateUserInput & { id: string }) =>
      (await apiClient.patch<AdminUser>(`/admin/users/${id}`, data)).data,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
    },
  });
}

/** Wipe all tenant data and non-admin users. SUPER_ADMIN only. */
