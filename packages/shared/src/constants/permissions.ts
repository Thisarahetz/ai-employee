/**
 * RBAC permission-string catalogue and default role grants.
 *
 * Kept in sync by hand with `apps/api/src/modules/auth/auth.service.ts`'s
 * `TENANT_ROLE_PERMISSIONS` map — that map is the actual source of truth
 * enforced by `RolesGuard`; this file mirrors it for non-NestJS consumers
 * (the web app, SDKs) that want the catalogue without importing the API.
 *
 * `TenantRole` (`OWNER`/`ADMIN`/`MANAGER`/`EMPLOYEE`) is a fixed Prisma enum,
 * not a customizable per-tenant table — see the "Platform Administration &
 * Tenant Management" section of docs/architecture.md for why. Distinct from
 * `PlatformRole` (`NONE`/`SUPER_ADMIN`), which gates the cross-tenant
 * `/admin/*` API and is unrelated to any tenant role.
 *
 * Also distinct from the per-action permissions checked when the AI executes
 * an external action (see `docs/integration-api-contract.md` and
 * `apps/api/src/modules/external-action`) — those are scoped to individual
 * `IntegrationAction` rows, not this coarse catalogue.
 */
export const PERMISSIONS = [
  'tenant:read',
  'tenant:write',
  'businesses:read',
  'businesses:write',
  'users:read',
  'users:write',
  'users:invite',
  'conversations:read',
  'conversations:write',
  'conversations:takeover',
  'messages:read',
  'messages:write',
  'human_handoffs:read',
  'human_handoffs:write',
  'notifications:read',
  'integrations:read',
  'integrations:manage',
  'channels:read',
  'channels:manage',
  'ai:configure',
  'workflows:manage',
  'audit_logs:read',
  'ai_employees:read',
  'ai_employees:command',
  'ai_employees:manage',
  'ai_employees:approve',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type TenantRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

/**
 * `OWNER` gets `['*']` (RolesGuard treats it as "every permission") rather
 * than the literal `PERMISSIONS` array — matches the API's own representation.
 */
export const TENANT_ROLE_PERMISSIONS: Record<TenantRole, string[]> = {
  OWNER: ['*'],
  ADMIN: [
    'tenant:read',
    'tenant:write',
    'users:read',
    'users:write',
    'users:invite',
    'businesses:read',
    'businesses:write',
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
    'integrations:read',
    'integrations:manage',
    'channels:read',
    'channels:manage',
    'ai:configure',
    'workflows:manage',
    'audit_logs:read',
    'ai_employees:read',
    'ai_employees:command',
    'ai_employees:manage',
    'ai_employees:approve',
  ],
  MANAGER: [
    'tenant:read',
    'businesses:read',
    'users:read',
    'users:invite',
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
    'audit_logs:read',
    'ai_employees:read',
    'ai_employees:command',
  ],
  EMPLOYEE: [
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
  ],
};

export type PlatformRole = 'NONE' | 'SUPER_ADMIN';
