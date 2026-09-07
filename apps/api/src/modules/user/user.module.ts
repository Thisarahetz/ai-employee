import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

