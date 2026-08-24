/**
 * RBAC permission-string catalogue.
 *
 * `Role.permissions` (see `prisma/schema.prisma`) is a plain `String[]` column — Prisma
 * has no `Role` enum, and `Role.name` is a free-text, per-tenant value (tenants can
 * define custom roles). The strings below are the canonical, coarse, action-level
 * permission vocabulary that `apps/api`'s authorization guards check against; they are
 * *not* enforced by the database, only by convention + the guard layer, so keep this
 * list as the single source of truth for valid permission strings.
 *
 * This is distinct from the per-action permissions checked when the AI executes an
 * external action (see `docs/integration-api-contract.md` and
 * `apps/api/src/modules/external-action`) — those are scoped to individual
 * `IntegrationAction` rows, not this coarse catalogue.
 *
 * `OWNER` / `ADMIN` / `AGENT` / `VIEWER` are not a Prisma enum either — they are the
 * conventional seed role names AI Employee provisions for a new tenant (see the future
 * tenant-bootstrap/seed script in `apps/api`). Tenants may rename or add roles; these
 * are just sane defaults to seed with.
 */
export const PERMISSIONS = [
  'conversations:read',
  'conversations:write',
  'customers:read',
  'customers:write',
  'integrations:manage',
  'channels:manage',
  'ai-config:manage',
  'knowledge-base:manage',
  'workflows:manage',
  'users:manage',
  'roles:manage',
  'billing:manage',
  'audit-log:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type DefaultRoleName = 'OWNER' | 'ADMIN' | 'AGENT' | 'VIEWER';

/**
 * Default permission sets used when seeding a new tenant's roles. `OWNER` always gets
 * every known permission (kept in sync automatically); the others are curated subsets.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRoleName, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: [
    'conversations:read',
    'conversations:write',
    'customers:read',
    'customers:write',
    'integrations:manage',
    'channels:manage',
    'ai-config:manage',
    'knowledge-base:manage',
    'workflows:manage',
    'users:manage',
    'audit-log:read',
  ],
  AGENT: ['conversations:read', 'conversations:write', 'customers:read', 'customers:write'],
  VIEWER: ['conversations:read', 'customers:read', 'audit-log:read'],
};
