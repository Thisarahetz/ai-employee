import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    RagModule,
    // No storage engine configured -> multer defaults to in-memory storage,
    // giving us `file.buffer` directly. KnowledgeBaseService writes that
    // buffer to local disk or S3 itself (see storeFile()).
    MulterModule.register({
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
