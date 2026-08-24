import { IsIn, IsOptional, IsString } from 'class-validator';

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
}
