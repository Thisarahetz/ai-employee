"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type {
  AdminTenant,
  AdminUser,
  AdminUserDetail,
  CreateTenantInput,
  CreateTenantResult,
  PaginatedResponse,
  PlatformAuditEntry,
  TenantMembership,
  TenantStatus,
  UpdateUserInput,
} from "@/lib/types";

export interface AdminListParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

function listParams({ search, page, pageSize }: AdminListParams) {
  const params: Record<string, string | number> = {};
  if (search) params.search = search;
  if (page) params.page = page;
  if (pageSize) params.pageSize = pageSize;
  return params;
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

export function useAdminAuditLog(params: { targetType?: "tenant" | "user"; targetId?: string }) {
  return useQuery({
    queryKey: ["admin", "audit-log", params],
    queryFn: async () =>
      (await apiClient.get<PaginatedResponse<PlatformAuditEntry>>("/admin/audit-log", { params })).data,
    enabled: !!params.targetId,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTenantInput) =>
      (await apiClient.post<CreateTenantResult>("/admin/tenants", input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] }),
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
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
    },
  });
}
