import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantName: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @IsNotEmpty()
  ownerFirstName: string;

  @IsString()
  @IsNotEmpty()
  ownerLastName: string;

  /** Omit to have the server generate one, returned once in the response. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;
}
