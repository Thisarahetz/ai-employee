import type { BadgeColor } from "@/components/ui/badge";
import type {
  AiTaskStatus,
  ChannelStatus,
  ConversationStatus,
  DocumentStatus,
  HandoffStatus,
  IntegrationStatus,
  TenantStatus,
  UserStatus,
  WorkflowExecutionStatus,
} from "./types";

/**
 * Central label + color map per enum value, so status badges are
 * color-coded consistently everywhere instead of ad hoc per page.
 */

export const conversationStatusStyles: Record<ConversationStatus, { label: string; color: BadgeColor }> = {
  OPEN: { label: "Open", color: "gray" },
  AI_HANDLING: { label: "AI handling", color: "blue" },
  HUMAN_HANDLING: { label: "Human handling", color: "amber" },
  CLOSED: { label: "Closed", color: "gray" },
};

export const documentStatusStyles: Record<DocumentStatus, { label: string; color: BadgeColor }> = {
  PENDING: { label: "Pending", color: "gray" },
  PROCESSING: { label: "Processing", color: "blue" },
  READY: { label: "Ready", color: "green" },
  FAILED: { label: "Failed", color: "red" },
};

export const integrationStatusStyles: Record<IntegrationStatus, { label: string; color: BadgeColor }> = {
  CONNECTED: { label: "Connected", color: "green" },
  DISCONNECTED: { label: "Disconnected", color: "gray" },
  ERROR: { label: "Error", color: "red" },
};

export const channelStatusStyles: Record<ChannelStatus, { label: string; color: BadgeColor }> = {
  ACTIVE: { label: "Active", color: "green" },
  INACTIVE: { label: "Inactive", color: "gray" },
};

export const handoffStatusStyles: Record<HandoffStatus, { label: string; color: BadgeColor }> = {
  PENDING: { label: "Pending", color: "amber" },
  ACTIVE: { label: "Active", color: "blue" },
  RESOLVED: { label: "Resolved", color: "green" },
};

export const tenantStatusStyles: Record<TenantStatus, { label: string; color: BadgeColor }> = {
  ACTIVE: { label: "Active", color: "green" },
  TRIAL: { label: "Trial", color: "blue" },
  SUSPENDED: { label: "Suspended", color: "red" },
};

export const userStatusStyles: Record<UserStatus, { label: string; color: BadgeColor }> = {
  ACTIVE: { label: "Active", color: "green" },
  INVITED: { label: "Invited", color: "blue" },
  DISABLED: { label: "Disabled", color: "red" },
};

export const workflowExecutionStatusStyles: Record<WorkflowExecutionStatus, { label: string; color: BadgeColor }> = {
  PENDING: { label: "Pending", color: "gray" },
  RUNNING: { label: "Running", color: "blue" },
  SUCCESS: { label: "Success", color: "green" },
  FAILED: { label: "Failed", color: "red" },
};

export const aiTaskStatusStyles: Record<AiTaskStatus, { label: string; color: BadgeColor }> = {
  QUEUED: { label: "Queued", color: "gray" },
  RUNNING: { label: "Working", color: "blue" },
  WAITING_APPROVAL: { label: "Needs approval", color: "amber" },
  PAUSED: { label: "Paused", color: "gray" },
  BLOCKED: { label: "Blocked", color: "red" },
  COMPLETED: { label: "Done", color: "green" },
  FAILED: { label: "Failed", color: "red" },
  CANCELLED: { label: "Cancelled", color: "gray" },
};
