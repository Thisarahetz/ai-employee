import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Carries "which AI task is running" through every async call it makes, so
 * events emitted as a side effect of AI work can be recognised (and not
 * re-trigger automation rules in a loop).
 */
export interface WorkforceExecutionContext {
  tenantId: string;
  taskId: string;
}

export const workforceContext = new AsyncLocalStorage<WorkforceExecutionContext>();

export const currentTaskId = (): string | undefined => workforceContext.getStore()?.taskId;
