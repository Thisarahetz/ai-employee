import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NluController } from './nlu.controller';
import { NluService } from './nlu.service';
import { RasaClient } from './rasa.client';

@Module({
  imports: [PrismaModule],
  controllers: [NluController],
  providers: [RasaClient, NluService],
  exports: [NluService, RasaClient],
})
export class NluModule {}
