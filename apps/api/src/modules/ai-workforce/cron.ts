import { parseExpression } from 'cron-parser';

/** Shortest allowed gap between runs of one schedule — stops a "* * * * *" money pit. */
export const MIN_SCHEDULE_INTERVAL_MS = 15 * 60_000;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a 5-field cron expression and returns the next run after `from`.
 * Throws with a readable message on bad input.
 */
export function nextRun(cron: string, timezone: string, from: Date = new Date()): Date {
  const expr = cron.trim().replace(/\s+/g, ' ');
  if (expr.split(' ').length !== 5) {
    throw new Error('Use a 5-field cron expression: minute hour day-of-month month day-of-week (e.g. "0 9 * * 1-5").');
  }
  if (!isValidTimezone(timezone)) throw new Error(`Unknown timezone "${timezone}".`);
  try {
    return parseExpression(expr, { tz: timezone, currentDate: from }).next().toDate();
  } catch (err) {
    throw new Error(`Invalid cron expression "${cron}": ${(err as Error).message}`);
  }
}

/** Smallest gap between the next few runs, used to reject overly frequent schedules. */
export function minIntervalMs(cron: string, timezone: string, from: Date = new Date(), samples = 6): number {
  let prev = nextRun(cron, timezone, from);
  let min = Infinity;
  for (let i = 0; i < samples; i++) {
    const n = nextRun(cron, timezone, prev);
    min = Math.min(min, n.getTime() - prev.getTime());
    prev = n;
  }
  return min;
}

export function assertScheduleAllowed(cron: string, timezone: string, minGapMs = MIN_SCHEDULE_INTERVAL_MS): Date {
  const first = nextRun(cron, timezone);
  const gap = minIntervalMs(cron, timezone);
  if (gap < minGapMs) {
    throw new Error(`Runs too often: schedules may run at most every ${Math.round(minGapMs / 60_000)} minutes.`);
  }
  return first;
}
