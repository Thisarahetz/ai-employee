import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendChannelMessageDto {
  @IsNotEmpty()
  @IsString()
  recipient!: string;

  @IsNotEmpty()
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  channelId?: string;
}
