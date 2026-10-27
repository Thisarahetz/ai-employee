import { Module } from '@nestjs/common';
import { VoiceSessionRegistry } from './voice-session.registry';

/**
 * Only the registry of open calls, with no other dependencies, so the channel
 * module (which delivers replies) and the voice module (which owns the calls)
 * can both use it without a module cycle.
 */
@Module({ providers: [VoiceSessionRegistry], exports: [VoiceSessionRegistry] })
export class VoiceSessionsModule {}
