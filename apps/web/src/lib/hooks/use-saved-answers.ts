"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type {
  ReplyMode,
  ReplySettings,
  ReplyStats,
  SavedAnswer,
  SavedAnswerInput,
  SavedAnswerStatus,
  SavedAnswerTestResult,
} from "@/lib/types";

const KEY = ["saved-answers"];

/** GET /saved-answers?status= — suggestions come most-asked first. */
export function useSavedAnswers(status: SavedAnswerStatus) {
  return useQuery({
    queryKey: [...KEY, status],
    queryFn: async () => (await apiClient.get<SavedAnswer[]>("/saved-answers", { params: { status } })).data,
  });
}

export function useReplyStats(days = 30, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "stats", days],
    queryFn: async () => (await apiClient.get<ReplyStats>("/saved-answers/stats", { params: { days } })).data,
    enabled,
  });
}

export function useCreateSavedAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavedAnswerInput) => (await apiClient.post<SavedAnswer>("/saved-answers", input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSavedAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<SavedAnswerInput>) =>
      (await apiClient.patch<SavedAnswer>(`/saved-answers/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSavedAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/saved-answers/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestSavedAnswer() {
  return useMutation({
    mutationFn: async (input: { message: string; language: string }) =>
      (await apiClient.post<SavedAnswerTestResult>("/saved-answers/test", input)).data,
  });
}

export function useReplySettings() {
  return useQuery({
    queryKey: ["reply-settings"],
    queryFn: async () => (await apiClient.get<ReplySettings>("/reply-settings")).data,
  });
}

export function useSetReplyMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: ReplyMode) => (await apiClient.patch<ReplySettings>("/reply-settings", { mode })).data,
    onSuccess: (data) => qc.setQueryData(["reply-settings"], data),
  });
}
