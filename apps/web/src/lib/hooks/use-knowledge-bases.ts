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

export function useKnowledgeBase(id: string | undefined) {
  return useQuery({
    queryKey: ["knowledge-base", id],
    queryFn: async () => (await apiClient.get<KnowledgeBase>(`/knowledge-bases/${id}`)).data,
    enabled: !!id,
  });
}

export function useUpdateKnowledgeBase(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name?: string; description?: string }) =>
      (await apiClient.patch<KnowledgeBase>(`/knowledge-bases/${id}`, input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-base", id] });
    },
  });
}

export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.delete(`/knowledge-bases/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}

export function useDocuments(knowledgeBaseId: string | undefined) {
  return useQuery({
    queryKey: ["documents", knowledgeBaseId],
    queryFn: async () => (await apiClient.get<Document[]>(`/knowledge-bases/${knowledgeBaseId}/documents`)).data,
    enabled: !!knowledgeBaseId,
  });
}

export function useDocument(knowledgeBaseId: string | undefined, documentId: string | undefined) {
  return useQuery({
    queryKey: ["document", knowledgeBaseId, documentId],
    queryFn: async () =>
      (await apiClient.get<Document>(`/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`)).data,
    enabled: !!knowledgeBaseId && !!documentId,
  });
}

export function useUploadDocument(knowledgeBaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) =>
      (
        await apiClient.post<Document>(`/knowledge-bases/${knowledgeBaseId}/documents`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", knowledgeBaseId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}

export function useUpdateDocument(knowledgeBaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, data }: { documentId: string; data: { title?: string; content?: string } }) =>
      (await apiClient.patch<Document>(`/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`, data)).data,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["documents", knowledgeBaseId] });
      queryClient.invalidateQueries({ queryKey: ["document", knowledgeBaseId, variables.documentId] });
    },
  });
}

export function useDeleteDocument(knowledgeBaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) =>
      (await apiClient.delete(`/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", knowledgeBaseId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}

