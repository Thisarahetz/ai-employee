"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { InviteMemberInput, InviteMemberResult, MembershipStatus, TenantMembership, TenantRole } from "@/lib/types";

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: async () => (await apiClient.get<TenantMembership[]>("/users")).data,
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteMemberInput) =>
      (await apiClient.post<InviteMemberResult>("/users/invite", input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; role?: TenantRole; status?: MembershipStatus }) =>
      (await apiClient.patch<TenantMembership>(`/users/${id}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/users/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  });
}
