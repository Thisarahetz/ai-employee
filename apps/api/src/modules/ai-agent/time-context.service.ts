import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface TimeContext {
  timezone: string;
  offset: string;
  now: Date;
  isoDate: string;
  timeString: string;
  dayOfWeek: string;
  year: number;
  month: number;
  day: number;
  formatted: string;
  locationsSummary?: string;
}

@Injectable()
export class TimeContextService {
  private readonly logger = new Logger(TimeContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolves the active timezone for a conversation or tenant, and constructs
   * a rich TimeContext object containing current localized timestamps and date parts.
   */
  async getTimeContext(
    tenantId: string,
    conversationId?: string,
    now: Date = new Date(),
  ): Promise<TimeContext> {
    const { timezone, locationsSummary } = await this.resolveTimezone(tenantId, conversationId);
    return this.buildTimeContext(timezone, now, locationsSummary);
  }

  /**
   * Determines the appropriate timezone for the given tenant / conversation.
   * Priority:
   * 1. Conversation's linked Business (location) timezone
   * 2. Tenant's primary Business (location) timezone
   * 3. Configured DEFAULT_TIMEZONE / GENERIC_TIMEZONE environment variable
   * 4. 'Asia/Colombo' (matching default salon timezone)
   */
  async resolveTimezone(
    tenantId: string,
    conversationId?: string,
  ): Promise<{ timezone: string; locationsSummary?: string }> {
    const defaultZone =
      this.config.get<string>('DEFAULT_TIMEZONE') ||
      this.config.get<string>('GENERIC_TIMEZONE') ||
      'Asia/Colombo';

    if (conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        select: {
          business: { select: { id: true, name: true, timezone: true } },
        },
      });

      if (conversation?.business?.timezone) {
        return { timezone: conversation.business.timezone };
      }
    }

    const businesses = await this.prisma.business.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, timezone: true },
    });

    const locationsSummary =
      businesses.length > 0
        ? businesses.map((b) => `- ${b.name} (Timezone: ${b.timezone || defaultZone})`).join('\n')
        : undefined;

    const primaryZone = businesses.find((b) => Boolean(b.timezone))?.timezone;
    const timezone = primaryZone || defaultZone;

    return { timezone, locationsSummary };
  }

  /**
   * Pure formatter that builds a structured TimeContext from a validated IANA timezone.
   */
  buildTimeContext(timeZone: string, now: Date = new Date(), locationsSummary?: string): TimeContext {
    let validZone = timeZone?.trim() || 'Asia/Colombo';
    try {
      Intl.DateTimeFormat(undefined, { timeZone: validZone });
    } catch {
      this.logger.warn(`Invalid timezone "${validZone}", falling back to Asia/Colombo`);
      validZone = 'Asia/Colombo';
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: validZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long',
      hour12: false,
      timeZoneName: 'shortOffset',
    });

    const parts = formatter.formatToParts(now);
    const partMap: Record<string, string> = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }

    const year = parseInt(partMap.year || `${now.getUTCFullYear()}`, 10);
    const month = parseInt(partMap.month || `${now.getUTCMonth() + 1}`, 10);
    const day = parseInt(partMap.day || `${now.getUTCDate()}`, 10);
    const hour = partMap.hour || '00';
    const minute = partMap.minute || '00';
    const dayOfWeek = partMap.weekday || '';
    const timeZoneName = partMap.timeZoneName || '';

    // Compute standardized offset string (e.g. "+05:30", "-04:00", "+00:00")
    let offset = '+00:00';
    const offsetMatch = timeZoneName.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (offsetMatch) {
      const signAndHours = offsetMatch[1];
      const sign = signAndHours[0];
      const hoursNum = parseInt(signAndHours.slice(1), 10);
      const minsNum = offsetMatch[2] ? parseInt(offsetMatch[2], 10) : 0;
      offset = `${sign}${String(hoursNum).padStart(2, '0')}:${String(minsNum).padStart(2, '0')}`;
    }

    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 12-hour formatted time (e.g. "10:52 AM")
    const hourNum = parseInt(hour, 10);
    const hour12 = hourNum % 12 || 12;
    const ampm = hourNum < 12 ? 'AM' : 'PM';
    const timeString = `${hour12}:${minute} ${ampm}`;

    const fullReadable = new Intl.DateTimeFormat('en-US', {
      timeZone: validZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now);

    const formatted = `${fullReadable} (${validZone}, ${timeZoneName || `UTC${offset}`})`;

    return {
      timezone: validZone,
      offset,
      now,
      isoDate,
      timeString,
      dayOfWeek,
      year,
      month,
      day,
      formatted,
      locationsSummary,
    };
  }
}
