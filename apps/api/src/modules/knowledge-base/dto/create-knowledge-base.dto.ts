import { IsOptional, IsString } from 'class-validator';

export class CreateKnowledgeBaseDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
