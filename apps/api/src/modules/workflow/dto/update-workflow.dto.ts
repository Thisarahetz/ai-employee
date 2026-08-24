import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  n8nWorkflowId?: string;

  @IsOptional()
  @IsString()
  triggerEventType?: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
