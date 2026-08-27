"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Business, BusinessInput } from "@/lib/types";

/** GET /businesses — every location/branch under the active tenant, oldest first. */
export function useBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async () => (await apiClient.get<Business[]>("/businesses")).data,
  });
}

export function useCreateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BusinessInput) =>
      (await apiClient.post<Business>("/businesses", input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["businesses"] }),
  });
}

export function useUpdateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<BusinessInput>) =>
      (await apiClient.patch<Business>(`/businesses/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["businesses"] }),
  });
}

export function useDeleteBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/businesses/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["businesses"] }),
  });
}
