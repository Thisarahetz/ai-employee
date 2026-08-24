import { IsEmail, IsIn, IsString, IsNotEmpty } from 'class-validator';

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

  @IsIn(INVITABLE_ROLES)
  role: (typeof INVITABLE_ROLES)[number];
}
