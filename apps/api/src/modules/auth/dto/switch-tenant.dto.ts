import { IsString, IsNotEmpty } from 'class-validator';

export class SwitchTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;
}
