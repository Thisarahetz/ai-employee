import { IsIn, IsOptional, IsString } from 'class-validator';
import { DocumentSourceType } from '@prisma/client';

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  /** Defaults to an extension-based guess (see KnowledgeBaseService.inferSourceType) if omitted. */
  @IsOptional()
  @IsIn(Object.values(DocumentSourceType))
  sourceType?: DocumentSourceType;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  url?: string;
}

