import { IsIn, IsOptional } from 'class-validator';

const PLATFORM_ROLES = ['NONE', 'SUPER_ADMIN'] as const;
const SETTABLE_USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;

/**
 * Cross-tenant account administration. `platformRole` grants/revokes access to
 * the /admin console itself; `status` enables/disables the account platform-wide.
 * At least one field must be present (enforced in AdminService).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsIn(PLATFORM_ROLES)
  platformRole?: (typeof PLATFORM_ROLES)[number];

  @IsOptional()
  @IsIn(SETTABLE_USER_STATUSES)
  status?: (typeof SETTABLE_USER_STATUSES)[number];
}
