import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const TENANT_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] as const;
const MEMBERSHIP_STATUSES = ['ACTIVE', 'INVITED', 'DISABLED'] as const;

export class UpdateMembershipDto {
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: (typeof TENANT_ROLES)[number];

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: (typeof MEMBERSHIP_STATUSES)[number];

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  businessRole?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  accessLevel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  allLocations?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];
}

