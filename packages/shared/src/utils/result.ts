/**
 * `Result<T>` mirrors the Integration API Contract's response envelope
 * (`{ success, message, data? }` — see `docs/integration-api-contract.md` and
 * `packages/types/src/integration-contract.ts`'s `ExecuteActionResponse`) so the
 * NestJS API, the Integration SDK, and the frontend all speak the same success/failure
 * shape instead of each inventing their own.
 *
 * This is intentionally the same shape as `ExecuteActionResponse` but lives in
 * `@ai-employee/shared` (rather than `@ai-employee/types`) because it is also used for
 * plain internal API responses that have nothing to do with the Integration Contract.
 */
export interface Result<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export function ok<T>(data?: T, message = 'OK'): Result<T> {
  return { success: true, message, data };
}

export function fail(message: string): Result<never> {
  return { success: false, message };
}

/** Narrows a `Result<T>` to its success branch, useful in `if (isOk(result))` checks. */
export function isOk<T>(result: Result<T>): result is Result<T> & { success: true; data: T } {
  return result.success === true;
}
