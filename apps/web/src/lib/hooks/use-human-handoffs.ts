"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { HandoffStatus, HumanHandoff } from "@/lib/types";

export function useHumanHandoffs(status: HandoffStatus = "PENDING") {
  return useQuery({
    queryKey: ["human-handoffs", status],
    queryFn: async () => (await apiClient.get<HumanHandoff[]>("/human-handoffs", { params: { status } })).data,
  });
}

export function useResolveHandoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post<HumanHandoff>(`/human-handoffs/${id}/resolve`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["human-handoffs"] }),
  });
}
