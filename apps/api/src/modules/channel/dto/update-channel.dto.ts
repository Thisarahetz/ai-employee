import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ChannelStatus } from '@prisma/client';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ChannelStatus)
  status?: ChannelStatus;
}
