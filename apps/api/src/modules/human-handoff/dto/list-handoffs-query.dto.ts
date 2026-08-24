import { IsIn, IsOptional } from 'class-validator';

const HANDOFF_STATUSES = ['PENDING', 'ACTIVE', 'RESOLVED'] as const;

export class ListHandoffsQueryDto {
  @IsOptional()
  @IsIn(HANDOFF_STATUSES)
  status?: (typeof HANDOFF_STATUSES)[number];
}
