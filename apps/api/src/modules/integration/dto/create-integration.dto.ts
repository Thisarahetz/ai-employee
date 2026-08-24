import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { IntegrationType } from '@prisma/client';

export class CreateIntegrationDto {
  @IsString()
  name!: string;

  @IsEnum(IntegrationType)
  type!: IntegrationType;

  /** External system's base URL, e.g. https://salon.example.com — required to discover/execute actions. */
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  /** Free-form config, e.g. { apiKeyHeader: "X-Salon-Key" } for API_KEY credentials. */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
