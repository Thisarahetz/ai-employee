import { Module } from '@nestjs/common';
import { CrmMockController } from './crm-mock.controller';

@Module({
  controllers: [CrmMockController],
})
export class CrmMockModule {}
