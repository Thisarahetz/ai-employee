import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class ImportTemplateDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
