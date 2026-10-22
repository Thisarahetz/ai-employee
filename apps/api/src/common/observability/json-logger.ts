import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * One JSON object per line (LOG_FORMAT=json) so logs can be shipped to any
 * aggregator (CloudWatch, Datadog, Loki, ELK) and queried by field.
 */
export class JsonLogger extends ConsoleLogger {
  protected printMessages(messages: unknown[], context = '', logLevel: LogLevel = 'log', writeStreamType?: 'stdout' | 'stderr') {
    for (const message of messages) {
      const entry: Record<string, unknown> = {
        time: new Date().toISOString(),
        level: logLevel,
        context: context || undefined,
        service: process.env.SERVICE_NAME || 'ai-employee-api',
      };
      if (message && typeof message === 'object' && !(message instanceof Error)) Object.assign(entry, message);
      else entry.msg = message instanceof Error ? message.message : String(message);
      process[writeStreamType ?? (logLevel === 'error' || logLevel === 'fatal' ? 'stderr' : 'stdout')].write(`${JSON.stringify(entry)}\n`);
    }
  }

  protected printStackTrace(stack: string) {
    if (stack) process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', stack })}\n`);
  }
}

export function createAppLogger() {
  const levels = (process.env.LOG_LEVELS ?? 'log,warn,error,fatal').split(',').map((l) => l.trim()) as LogLevel[];
  if (process.env.LOG_FORMAT === 'json') {
    const l = new JsonLogger();
    l.setLogLevels(levels);
    return l;
  }
  const l = new ConsoleLogger();
  l.setLogLevels(levels);
  return l;
}
