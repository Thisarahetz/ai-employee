import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

@UseGuards(JwtAuthGuard)
@Controller('knowledge-bases')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledgeBaseService.create(tenant.tenantId, dto);
  }

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.knowledgeBaseService.list(tenant.tenantId);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') knowledgeBaseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.knowledgeBaseService.uploadDocument(tenant.tenantId, knowledgeBaseId, file, dto);
  }

  @Get(':id/documents')
  listDocuments(@CurrentTenant() tenant: TenantContext, @Param('id') knowledgeBaseId: string) {
    return this.knowledgeBaseService.listDocuments(tenant.tenantId, knowledgeBaseId);
  }
}
