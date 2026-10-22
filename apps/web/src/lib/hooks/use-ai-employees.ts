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

interface SetupTemplate {
  id: string;
  key: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  owner: "platform" | "business";
  scheduleCount: number;
  ruleCount: number;
  employees: BusinessTemplateInfo["employees"];
}

/** Industry templates available to this business (platform + its own), keyed by template key. */
export function useAiEmployeeTemplates() {
  return useQuery({
    queryKey: ["business-setup", "templates"],
    queryFn: async (): Promise<BusinessTemplateInfo[]> => {
      const res = await apiClient.get<SetupTemplate[]>("/business-setup/templates");
      return res.data.map((t) => ({
        id: t.key,
        templateId: t.id,
        name: t.name,
        category: t.category,
        icon: t.icon,
        description: t.description,
        owner: t.owner,
        employeeCount: t.employees.length,
        employees: t.employees,
        scheduleCount: t.scheduleCount,
        ruleCount: t.ruleCount,
      }));
    },
  });
}

export interface ApplyTemplateResult {
  template: string;
  employees: { key: string; id: string; name: string; created: boolean }[];
  schedulesCreated: number;
  rulesCreated: number;
  automationsEnabled: boolean;
  problems: string[];
}

/** Installs a template: AI employees, recurring schedules and automation rules. */
export function useApplyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      businessType,
      selectedKeys,
      enableAutomations,
    }: {
      /** Template key, e.g. "SALON_SPA". */
      businessType: string;
      selectedKeys?: string[];
      enableAutomations?: boolean;
    }) => {
      const list =
        qc.getQueryData<BusinessTemplateInfo[]>(["business-setup", "templates"]) ??
        (await qc.fetchQuery({
          queryKey: ["business-setup", "templates"],
          queryFn: async () => (await apiClient.get<SetupTemplate[]>("/business-setup/templates")).data.map((t) => ({ id: t.key, templateId: t.id })),
        }) as BusinessTemplateInfo[]);
      const tmpl = list.find((t) => t.id === businessType);
      if (!tmpl?.templateId) throw new Error("That industry template is not available.");
      const res = await apiClient.post<ApplyTemplateResult>(`/business-setup/templates/${tmpl.templateId}/apply`, {
        employeeKeys: selectedKeys,
        enableAutomations: Boolean(enableAutomations),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-employees"] });
      qc.invalidateQueries({ queryKey: ["ai-workforce"] });
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
