/**
 * Shared pagination request/response shapes used consistently across every API list
 * endpoint (`apps/api`) and consumed as-is by `apps/web` and any SDK client.
 */
export interface PaginationRequest {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Normalizes a partial/untrusted pagination request (e.g. raw query params) into a
 * well-formed `PaginationRequest`, clamping page size to `MAX_PAGE_SIZE`.
 */
export function toPaginationRequest(input: Partial<Record<'page' | 'pageSize', number | undefined>>): PaginationRequest {
  const page = input.page && input.page > 0 ? Math.floor(input.page) : DEFAULT_PAGE;
  const pageSize =
    input.pageSize && input.pageSize > 0 ? Math.min(Math.floor(input.pageSize), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, pageSize };
}

/** Converts a 1-indexed `PaginationRequest` into a Prisma-style `skip` offset. */
export function paginationSkip(pagination: PaginationRequest): number {
  return (pagination.page - 1) * pagination.pageSize;
}

/** Builds a `PaginatedResponse` envelope from a page of data plus the total row count. */
export function toPaginatedResponse<T>(data: T[], total: number, pagination: PaginationRequest): PaginatedResponse<T> {
  return { data, total, page: pagination.page, pageSize: pagination.pageSize };
}
