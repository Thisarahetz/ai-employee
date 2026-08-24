import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  /** The workflow's id inside n8n itself — passed to N8nService.triggerWorkflow(). */
  @IsString()
  n8nWorkflowId!: string;

  /** Internal event type that fires this workflow, e.g. "human_handoff.requested" (see EVENT_TYPES). */
  @IsString()
  triggerEventType!: string;

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
