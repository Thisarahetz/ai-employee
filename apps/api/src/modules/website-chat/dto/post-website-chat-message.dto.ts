import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Body of `POST /channels/website-chat/:channelId/messages` — sent by the embedded widget. */
export class PostWebsiteChatMessageDto {
  /** Opaque per-visitor id the widget generates and persists in localStorage. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;
}
