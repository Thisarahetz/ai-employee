import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventService } from './event.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}
