import { Module } from '@nestjs/common';
import { ExternalActionService } from './external-action.service';

@Module({
  providers: [ExternalActionService],
  exports: [ExternalActionService],
})
export class ExternalActionModule {}
