import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { Channel } from "../types";

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async (): Promise<Channel[]> => {
      const res = await apiClient.get("/channels");
      return res.data;
    },
  });
}
