import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { IntegrationStatus } from '@prisma/client';

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(IntegrationStatus)
  status?: IntegrationStatus;
}
