import { IsIn, IsOptional } from 'class-validator';

const TENANT_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] as const;
const MEMBERSHIP_STATUSES = ['ACTIVE', 'INVITED', 'DISABLED'] as const;

export class UpdateMembershipDto {
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: (typeof TENANT_ROLES)[number];

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: (typeof MEMBERSHIP_STATUSES)[number];
}
