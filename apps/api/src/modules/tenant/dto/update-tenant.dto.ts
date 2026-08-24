import { IsIn, IsOptional, IsString } from 'class-validator';

const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'TRIAL'] as const;

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsIn(TENANT_STATUSES)
  status?: (typeof TENANT_STATUSES)[number];
}
