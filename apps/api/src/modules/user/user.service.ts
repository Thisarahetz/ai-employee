import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.user.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  }

  async get(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleId: dto.roleId,
      },
    });
  }

  /**
   * Scaffold only: creates the User row with status INVITED and no usable
   * password (a random hash placeholder) — no invite email is sent and no
   * invite-acceptance flow exists yet to let the user set a real password.
   */
  async invite(tenantId: string, dto: InviteUserDto) {
    const placeholderHash = await bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        passwordHash: placeholderHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleId: dto.roleId,
        status: 'INVITED',
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    await this.get(tenantId, id);
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
