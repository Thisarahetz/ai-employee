import { IsEnum, IsObject } from 'class-validator';
import { CredentialType } from '@prisma/client';

/**
 * Body of POST /channels/:id/credentials. `payload` shape depends on `type` and the
 * channel — e.g. WhatsApp Cloud API access token as BEARER_TOKEN { token }, SMTP creds
 * as BASIC_AUTH { username, password }.
 *
 * NOTE: unlike IntegrationCredential, the `ChannelCredential` model (schema.prisma) has
 * no `type` column — only `encryptedPayload`. `type` is accepted here for parity with
 * CreateIntegrationCredentialDto and so callers can self-document what they're storing,
 * but ChannelService.addCredential folds it into the encrypted JSON payload rather than
 * persisting it as a separate column.
 */
export class CreateChannelCredentialDto {
  @IsEnum(CredentialType)
  type!: CredentialType;

  @IsObject()
  payload!: Record<string, unknown>;
}
