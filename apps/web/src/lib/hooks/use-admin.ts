"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type {
  AdminTenant,
  AdminUser,
  CreateTenantInput,
  CreateTenantResult,
  Tenant,
  TenantMembership,
  TenantStatus,
} from "@/lib/types";

export function useAdminTenants() {
  return useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: async () => (await apiClient.get<AdminTenant[]>("/admin/tenants")).data,
  });
}

export function useAdminTenant(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "tenants", tenantId],
    queryFn: async () => (await apiClient.get<Tenant>(`/admin/tenants/${tenantId}`)).data,
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
export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => (await apiClient.get<AdminUser[]>("/admin/users")).data,
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
      (await apiClient.patch<Tenant>(`/admin/tenants/${id}`, data)).data,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants", variables.id] });
    },
  });
}
