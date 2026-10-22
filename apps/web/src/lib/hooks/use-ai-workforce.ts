import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AiEmployeeApproval, AiTask, OwnerCommandThread, SendCommandResponse } from "@/lib/types";

const ACTIVE: string[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "BLOCKED"];

export function useCommandThreads() {
  return useQuery({
    queryKey: ["ai-workforce", "threads"],
    queryFn: async () => (await apiClient.get<OwnerCommandThread[]>("/ai-workforce/threads")).data,
  });
}

/** Polls while the conversation has work in flight, so reports appear on their own. */
export function useCommandThread(id: string | null, poll: boolean) {
  return useQuery({
    queryKey: ["ai-workforce", "threads", id],
    queryFn: async () => (await apiClient.get<OwnerCommandThread>(`/ai-workforce/threads/${id}`)).data,
    enabled: Boolean(id),
    refetchInterval: poll ? 4000 : false,
  });
}

export function useWorkforceTasks(poll: boolean) {
  return useQuery({
    queryKey: ["ai-workforce", "tasks"],
    queryFn: async () => (await apiClient.get<AiTask[]>("/ai-workforce/tasks?limit=200")).data,
    refetchInterval: poll ? 4000 : false,
  });
}

export function isTaskActive(status: string) {
  return ACTIVE.includes(status);
}

export function useSendCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { text: string; threadId?: string | null }) =>
      (await apiClient.post<SendCommandResponse>("/ai-workforce/commands", {
        text: payload.text,
        threadId: payload.threadId ?? undefined,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-workforce"] });
      qc.invalidateQueries({ queryKey: ["ai-employees", "approvals"] });
    },
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/ai-workforce/threads/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-workforce", "threads"] }),
  });
}

export function useControlTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; action: "PAUSE" | "RESUME" | "CANCEL" | "PRIORITIZE" }) =>
      (await apiClient.post<AiTask>(`/ai-workforce/tasks/${payload.id}/control`, { action: payload.action })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-workforce"] }),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; decision: "APPROVED" | "REJECTED"; reviewNotes?: string }) =>
      (await apiClient.post<{ execution?: { executed: boolean; success?: boolean; message: string } }>(
        `/ai-workforce/approvals/${payload.id}/decide`,
        { decision: payload.decision, reviewNotes: payload.reviewNotes },
      )).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-workforce"] });
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
    },
  });
}

/** Same cache as useAiEmployeeApprovals("PENDING"), but kept fresh while work is in flight. */
export function usePendingApprovals(poll: boolean) {
  return useQuery({
    queryKey: ["ai-employees", "approvals", "PENDING"],
    queryFn: async () => (await apiClient.get<AiEmployeeApproval[]>("/ai-employees/approvals?status=PENDING")).data,
    refetchInterval: poll ? 4000 : false,
  });
}
