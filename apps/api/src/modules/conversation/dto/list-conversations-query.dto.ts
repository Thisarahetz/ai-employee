import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const CONVERSATION_STATUSES = ['OPEN', 'AI_HANDLING', 'HUMAN_HANDLING', 'CLOSED'] as const;

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: (typeof CONVERSATION_STATUSES)[number];

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  /** Restrict to conversations belonging to one location/branch (Business id). */
  @IsOptional()
  @IsString()
  businessId?: string;

  /** "en" | "si" (Sinhala) | "si-Latn" (Singlish). */
  @IsOptional()
  @IsIn(['en', 'si', 'si-Latn'])
  language?: 'en' | 'si' | 'si-Latn';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

