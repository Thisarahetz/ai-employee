import { IsOptional, IsString } from 'class-validator';

export class ResolveHandoffDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
