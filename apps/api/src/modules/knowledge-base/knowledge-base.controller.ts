import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

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

  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.knowledgeBaseService.get(tenant.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.update(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  delete(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.knowledgeBaseService.delete(tenant.tenantId, id);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') knowledgeBaseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.knowledgeBaseService.uploadDocument(tenant.tenantId, knowledgeBaseId, file, dto);
  }

  @Get(':id/documents')
  listDocuments(@CurrentTenant() tenant: TenantContext, @Param('id') knowledgeBaseId: string) {
    return this.knowledgeBaseService.listDocuments(tenant.tenantId, knowledgeBaseId);
  }

  @Get(':id/documents/:docId')
  getDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') knowledgeBaseId: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledgeBaseService.getDocument(tenant.tenantId, knowledgeBaseId, docId);
  }

  @Patch(':id/documents/:docId')
  updateDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') knowledgeBaseId: string,
    @Param('docId') docId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.knowledgeBaseService.updateDocument(tenant.tenantId, knowledgeBaseId, docId, dto);
  }

  @Delete(':id/documents/:docId')
  deleteDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') knowledgeBaseId: string,
    @Param('docId') docId: string,
  ) {
    return this.knowledgeBaseService.deleteDocument(tenant.tenantId, knowledgeBaseId, docId);
  }
}

