import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ChannelType } from '@prisma/client';

export class CreateChannelDto {
  @IsEnum(ChannelType)
  type!: ChannelType;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  /** Channel-specific config, e.g. { phoneNumberId } for WHATSAPP — matched against inbound webhooks. */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
