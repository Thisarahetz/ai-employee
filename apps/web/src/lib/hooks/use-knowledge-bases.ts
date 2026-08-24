"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Document, KnowledgeBase } from "@/lib/types";

export function useKnowledgeBases() {
  return useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: async () => (await apiClient.get<KnowledgeBase[]>("/knowledge-bases")).data,
  });
}

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) =>
      (await apiClient.post<KnowledgeBase>("/knowledge-bases", input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }),
  });
}

export function useDocuments(knowledgeBaseId: string | undefined) {
  return useQuery({
    queryKey: ["documents", knowledgeBaseId],
    queryFn: async () => (await apiClient.get<Document[]>(`/knowledge-bases/${knowledgeBaseId}/documents`)).data,
    enabled: !!knowledgeBaseId,
  });
}

export function useUploadDocument(knowledgeBaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) =>
      (
        await apiClient.post<Document[]>(`/knowledge-bases/${knowledgeBaseId}/documents`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", knowledgeBaseId] }),
  });
}
