import { IsEnum, IsObject } from 'class-validator';
import { CredentialType } from '@prisma/client';

/**
 * Body of POST /integrations/:id/credentials. `payload` shape depends on `type` — see
 * the field conventions documented in ExternalActionService.buildAuthHeaders().
 */
export class CreateIntegrationCredentialDto {
  @IsEnum(CredentialType)
  type!: CredentialType;

  @IsObject()
  payload!: Record<string, unknown>;
}
