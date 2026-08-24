import { IsOptional, IsString } from 'class-validator';

export class ListAuditLogsQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;
}
