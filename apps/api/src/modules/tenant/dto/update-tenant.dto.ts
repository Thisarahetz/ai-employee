import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

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

  /** Default reply language for customers: "en" or "si" (Sinhala). */
  @IsOptional()
  @IsIn(['en', 'si'])
  defaultLanguage?: 'en' | 'si';

  /** Reply in the language each customer writes in. */
  @IsOptional()
  @IsBoolean()
  matchCustomerLanguage?: boolean;
}
