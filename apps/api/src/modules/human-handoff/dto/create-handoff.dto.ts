import { IsIn, IsOptional, IsString } from 'class-validator';

const HANDOFF_REASONS = [
  'CUSTOMER_REQUEST',
  'LOW_CONFIDENCE',
  'UNSUPPORTED_REQUEST',
  'SENSITIVE_REQUEST',
  'REPEATED_FAILURE',
] as const;

export class CreateHandoffDto {
  @IsString()
  conversationId: string;

  @IsIn(HANDOFF_REASONS)
  reason: (typeof HANDOFF_REASONS)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
