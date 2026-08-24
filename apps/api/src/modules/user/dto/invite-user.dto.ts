import { IsEmail, IsString } from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  roleId: string;
}
