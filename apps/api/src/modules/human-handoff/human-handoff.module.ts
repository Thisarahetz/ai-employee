import { Module } from '@nestjs/common';
import { EventModule } from '../../events/event.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { HumanHandoffController } from './human-handoff.controller';
import { HumanHandoffService } from './human-handoff.service';

@Module({
  imports: [PrismaModule, EventModule],
  controllers: [HumanHandoffController],
  providers: [HumanHandoffService],
  exports: [HumanHandoffService],
})
export class HumanHandoffModule {}
