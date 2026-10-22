"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type {
  CredentialType,
  Integration,
  IntegrationAction,
  IntegrationTestResult,
  IntegrationType,
  IntegrationWebhookSecret,
} from "@/lib/types";

export function useIntegrations(enabled = true) {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: async () => (await apiClient.get<Integration[]>("/integrations")).data,
    enabled,
  });
}

export interface CreateIntegrationInput {
  name: string;
  type: IntegrationType;
  baseUrl?: string;
  config?: Record<string, unknown>;
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIntegrationInput) => (await apiClient.post<Integration & IntegrationWebhookSecret>("/integrations", input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/integrations/${id}`);
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export interface SetCredentialsInput {
  integrationId: string;
  type: CredentialType;
  payload: Record<string, unknown>;
}

export function useSetIntegrationCredentials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ integrationId, type, payload }: SetCredentialsInput) => {
      await apiClient.post(`/integrations/${integrationId}/credentials`, { type, payload });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["integration-actions", variables.integrationId] });
    },
  });
}

export function useDiscoverActions(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ actions: IntegrationAction[] }>(`/integrations/${integrationId}/discover`)).data.actions,
    onSuccess: (actions) => {
      queryClient.setQueryData(["integration-actions", integrationId], actions);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
}

export function useIntegrationActions(integrationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["integration-actions", integrationId],
    queryFn: async () => (await apiClient.get<IntegrationAction[]>(`/integrations/${integrationId}/actions`)).data,
    enabled: !!integrationId && enabled,
  });
}

export interface SyncKnowledgeResult {
  integrationId: string;
  knowledgeBaseId: string;
  created: number;
  updated: number;
  removed: number;
  locationsCreated: number;
  locationsUpdated: number;
}

export function useSyncIntegrationKnowledge(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<SyncKnowledgeResult>(`/integrations/${integrationId}/knowledge/sync`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
  });
}

/** Reach the system, load its actions and sync its knowledge in one go. */
export function useTestIntegration(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string = integrationId) =>
      (await apiClient.post<IntegrationTestResult>(`/integrations/${id}/test`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["integration-actions"] });
      // A first connection completes a required setup step.
      queryClient.invalidateQueries({ queryKey: ["business-setup", "getting-started"] });
    },
  });
}

/** Issues a new webhook secret (the old one stops working at once). */
export function useRotateWebhookSecret(integrationId: string) {
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<IntegrationWebhookSecret>(`/integrations/${integrationId}/webhook-secret`)).data,
  });
}

/** Polls the list so a newly arrived event shows up without a reload. */
export function useIntegrationsLive(enabled: boolean) {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: async () => (await apiClient.get<Integration[]>("/integrations")).data,
    refetchInterval: enabled ? 5000 : false,
  });
}

export interface DeveloperKitResponse {
  integration: Integration;
  apiKey: string;
  webhookUrl: string;
  webhookSecret: string;
}

/** AI Employee creates the connection and its keys for the owner's developer. */
export function useCreateDeveloperKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await apiClient.post<DeveloperKitResponse>("/integrations/developer-kit", { name })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

/** New keys for a lost kit — the old ones stop working at once. */
export function useRenewDeveloperKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post<DeveloperKitResponse>(`/integrations/${id}/developer-kit`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; baseUrl?: string; name?: string }) =>
      (await apiClient.patch<Integration>(`/integrations/${id}`, body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}
