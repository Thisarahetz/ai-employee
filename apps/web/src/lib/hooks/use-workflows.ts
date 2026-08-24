"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Workflow, WorkflowExecution } from "@/lib/types";

export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: async () => (await apiClient.get<Workflow[]>("/workflows")).data,
  });
}

export function useWorkflowExecutions(workflowId: string | undefined) {
  return useQuery({
    queryKey: ["workflow-executions", workflowId],
    queryFn: async () => (await apiClient.get<WorkflowExecution[]>(`/workflows/${workflowId}/executions`)).data,
    enabled: !!workflowId,
  });
}

/**
 * TODO: the contract does not list a PATCH /workflows/:id endpoint — enabling
 * /disabling a workflow is invented here (`PATCH /workflows/:id { isEnabled }`)
 * following the same shape as the documented `PATCH /integrations`. Confirm
 * with the backend team and adjust this one function if the real route differs.
 */
export function useToggleWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      (await apiClient.patch<Workflow>(`/workflows/${id}`, { isEnabled })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });
}
