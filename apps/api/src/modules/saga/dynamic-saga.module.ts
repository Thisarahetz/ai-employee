import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExternalActionModule } from '../external-action/external-action.module';
import { DynamicSagaService } from './dynamic-saga.service';

@Module({
  imports: [PrismaModule, ExternalActionModule],
  providers: [DynamicSagaService],
  exports: [DynamicSagaService],
})
export class DynamicSagaModule {}
