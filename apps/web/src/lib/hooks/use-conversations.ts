"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Conversation, ConversationStatus, Message, PaginatedResponse } from "@/lib/types";

export function useConversations(
  status: ConversationStatus | "ALL" = "ALL",
  page = 1,
  businessId?: string | null,
) {
  return useQuery({
    queryKey: ["conversations", status, page, businessId ?? null],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<Conversation>>("/conversations", {
        params: {
          status: status === "ALL" ? undefined : status,
          page,
          businessId: businessId || undefined,
        },
      });
      return data;
    },
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => (await apiClient.get<Conversation>(`/conversations/${id}`)).data,
    enabled: !!id,
  });
}

export function useConversationMessages(id: string | undefined, page = 1) {
  return useQuery({
    queryKey: ["conversation-messages", id, page],
    queryFn: async () =>
      (await apiClient.get<PaginatedResponse<Message>>(`/conversations/${id}/messages`, { params: { page } })).data,
    enabled: !!id,
  });
}

export function useTakeControl(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.post<Conversation>(`/conversations/${conversationId}/take-control`)).data,
    onSuccess: (conversation) => {
      queryClient.setQueryData(["conversation", conversationId], conversation);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useReturnToAi(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.post<Conversation>(`/conversations/${conversationId}/return-to-ai`)).data,
    onSuccess: (conversation) => {
      queryClient.setQueryData(["conversation", conversationId], conversation);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) =>
      (await apiClient.post<Message>(`/conversations/${conversationId}/messages`, { content })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

