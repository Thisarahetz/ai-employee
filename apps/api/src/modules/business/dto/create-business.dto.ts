import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

const BUSINESS_TYPES = [
  'SALON',
  'HOTEL',
  'CLINIC',
  'ECOMMERCE',
  'CRM',
  'VEHICLE_SERVICE',
  'ERP',
  'CUSTOM',
] as const;

export class CreateBusinessDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsIn(BUSINESS_TYPES)
  type?: (typeof BUSINESS_TYPES)[number];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
