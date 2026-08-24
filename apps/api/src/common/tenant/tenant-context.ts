import { PlatformRole, TenantRole } from '@prisma/client';

/**
 * `tenantId`/`role` are typed non-nullable to avoid rippling `| null` through
 * every tenant-scoped controller/service in the app (they're the caller's
 * *active* tenant membership). In reality a platform admin with zero tenant
 * memberships gets a token with `tenantId: null` at runtime — harmless for
 * the ~15 tenant-scoped modules (a query filtered on a literal `null`
 * tenantId just returns nothing, since it's a required column), and such
 * accounts should be using /admin/* (PlatformAdminGuard, keyed off
 * `platformRole`, not tenantId) rather than tenant-scoped routes anyway.
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  role: TenantRole | null;
  permissions: string[];
  /** Platform-level access, unrelated to tenantId/role. */
  platformRole: PlatformRole;
}
