import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  AiEmployee,
  AiEmployeeStatsSummary,
  AiEmployeeApproval,
  AiEmployeeActivity,
  BusinessTemplateInfo,
  AiEmployeeStatus,
} from "@/lib/types";

export function useAiEmployees(filters?: {
  status?: string;
  department?: string;
  branchId?: string;
}) {
  return useQuery({
    queryKey: ["ai-employees", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.department) params.append("department", filters.department);
      if (filters?.branchId) params.append("branchId", filters.branchId);

      const res = await apiClient.get<AiEmployee[]>(
        `/ai-employees${params.toString() ? `?${params.toString()}` : ""}`
      );
      return res.data;
    },
  });
}

export function useAiEmployeeStats() {
  return useQuery({
    queryKey: ["ai-employees", "stats"],
    queryFn: async () => {
      const res = await apiClient.get<AiEmployeeStatsSummary>("/ai-employees/stats");
      return res.data;
    },
  });
}

export function useAiEmployee(id: string) {
  return useQuery({
    queryKey: ["ai-employees", id],
    queryFn: async () => {
      const res = await apiClient.get<AiEmployee>(`/ai-employees/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateAiEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AiEmployee>) => {
      const res = await apiClient.post<AiEmployee>("/ai-employees", payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
    },
  });
}

export function useUpdateAiEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<AiEmployee>;
    }) => {
      const res = await apiClient.patch<AiEmployee>(`/ai-employees/${id}`, data);
      return res.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
      qc.invalidateQueries({ queryKey: ["ai-employees", id] });
    },
  });
}

export function useToggleEmployeeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: AiEmployeeStatus;
    }) => {
      const res = await apiClient.patch<AiEmployee>(`/ai-employees/${id}/status`, {
        status,
      });
      return res.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
      qc.invalidateQueries({ queryKey: ["ai-employees", id] });
    },
  });
}

export function useDeleteAiEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/ai-employees/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
    },
  });
}

export function useAiEmployeeTemplates() {
  return useQuery({
    queryKey: ["ai-employees", "templates"],
    queryFn: async () => {
      const res = await apiClient.get<BusinessTemplateInfo[]>("/ai-employees/templates");
      return res.data;
    },
  });
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      businessType,
      businessSize,
      selectedKeys,
    }: {
      businessType: string;
      businessSize?: "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE";
      selectedKeys?: string[];
    }) => {
      const res = await apiClient.post<{
        templateName: string;
        installedCount: number;
        employees: AiEmployee[];
      }>("/ai-employees/templates/apply", {
        businessType,
        businessSize,
        selectedKeys,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
    },
  });
}

export function useAiEmployeeApprovals(status?: string) {
  return useQuery({
    queryKey: ["ai-employees", "approvals", status],
    queryFn: async () => {
      const res = await apiClient.get<AiEmployeeApproval[]>(
        `/ai-employees/approvals${status ? `?status=${status}` : ""}`
      );
      return res.data;
    },
  });
}

export function useReviewApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      reviewNotes,
    }: {
      id: string;
      decision: "APPROVED" | "REJECTED";
      reviewNotes?: string;
    }) => {
      const res = await apiClient.post<AiEmployeeApproval>(
        `/ai-employees/approvals/${id}/review`,
        { decision, reviewNotes }
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
      qc.invalidateQueries({ queryKey: ["ai-employees", "approvals"] });
    },
  });
}

export function useAiEmployeeActivities(filters?: {
  employeeId?: string;
  category?: string;
  branchId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["ai-employees", "activities", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.employeeId) params.append("employeeId", filters.employeeId);
      if (filters?.category) params.append("category", filters.category);
      if (filters?.branchId) params.append("branchId", filters.branchId);
      if (filters?.limit) params.append("limit", String(filters.limit));

      const res = await apiClient.get<AiEmployeeActivity[]>(
        `/ai-employees/activities${params.toString() ? `?${params.toString()}` : ""}`
      );
      return res.data;
    },
  });
}
