import { IsIn, IsOptional, IsString } from 'class-validator';

const USER_STATUSES = ['ACTIVE', 'INVITED', 'DISABLED'] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];
}
