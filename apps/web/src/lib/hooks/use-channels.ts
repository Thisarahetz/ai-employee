import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../api-client";
import type { Channel, ChannelConnectionInfo, ChannelType, CredentialType } from "../types";

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async (): Promise<Channel[]> => (await apiClient.get("/channels")).data,
  });
}

export function useChannel(id: string) {
  return useQuery({
    queryKey: ["channel", id],
    queryFn: async (): Promise<Channel> => (await apiClient.get(`/channels/${id}`)).data,
    enabled: !!id,
  });
}

export function useChannelConnectionInfo(id: string) {
  return useQuery({
    queryKey: ["channel-connection-info", id],
    queryFn: async (): Promise<ChannelConnectionInfo> =>
      (await apiClient.get(`/channels/${id}/connection-info`)).data,
    enabled: !!id,
  });
}

export interface CreateChannelInput {
  name: string;
  type: ChannelType;
  businessId?: string;
  config?: Record<string, unknown>;
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateChannelInput): Promise<Channel> =>
      (await apiClient.post("/channels", { config: {}, ...input })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export function useUpdateChannel(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      name?: string;
      status?: string;
      businessId?: string | null;
      config?: Record<string, unknown>;
    }): Promise<Channel> => (await apiClient.patch(`/channels/${id}`, patch)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["channel", id] });
      queryClient.invalidateQueries({ queryKey: ["channel-connection-info", id] });
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/channels/${id}`);
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export interface SetChannelCredentialsInput {
  type: CredentialType;
  payload: Record<string, unknown>;
}

export function useSetChannelCredentials(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, payload }: SetChannelCredentialsInput) => {
      await apiClient.post(`/channels/${id}/credentials`, { type, payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel", id] });
      queryClient.invalidateQueries({ queryKey: ["channel-connection-info", id] });
    },
  });
}

export function useTestChannel(id: string) {
  return useMutation({
    mutationFn: async (): Promise<{ ok: boolean; detail: string }> =>
      (await apiClient.post(`/channels/${id}/test`)).data,
  });
}
