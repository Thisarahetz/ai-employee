import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// OWNER is deliberately excluded — ownership transfer is a PATCH on an
// existing membership, not something granted casually via invite.
const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE'] as const;

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsIn(INVITABLE_ROLES)
  role: (typeof INVITABLE_ROLES)[number];

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
