import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

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

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  tenantName: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;

  /** Type of business this workspace runs — applied to its first location. */
  @IsOptional()
  @IsIn(BUSINESS_TYPES)
  businessType?: (typeof BUSINESS_TYPES)[number];

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;
}
