"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type {
  InviteMemberInput,
  InviteMemberResult,
  RoleTemplatesResponse,
  TenantMembership,
  UpdateMemberInput,
} from "@/lib/types";

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: async () => (await apiClient.get<TenantMembership[]>("/users")).data,
  });
}

export function useRoleTemplates() {
  return useQuery({
    queryKey: ["team", "role-templates"],
    queryFn: async () => (await apiClient.get<RoleTemplatesResponse>("/users/roles/templates")).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeamMemberDetail(id?: string | null) {
  return useQuery({
    queryKey: ["team", id],
    queryFn: async () => (await apiClient.get<TenantMembership>(`/users/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteMemberInput) =>
      (await apiClient.post<InviteMemberResult>("/users/invite", input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateMemberInput) =>
      (await apiClient.patch<TenantMembership>(`/users/${id}`, data)).data,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["team", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useResendInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<{ success: boolean; temporaryPassword?: string; message: string }>(`/users/${id}/resend-invite`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  });
}

export function useCancelInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/users/${id}/cancel-invite`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/users/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
