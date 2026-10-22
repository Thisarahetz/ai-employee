import { createHmac } from 'node:crypto';

export interface SendEventOptions {
  /** AI Employee webhook URL for this integration. Defaults to AI_EMPLOYEE_WEBHOOK_URL. */
  webhookUrl?: string;
  /** Webhook secret AI Employee showed when the integration was created. Defaults to AI_EMPLOYEE_WEBHOOK_SECRET. */
  webhookSecret?: string;
  /** Extra attempts after the first on network errors, 429 and 5xx (default 2). */
  retries?: number;
  /** Per-attempt timeout in ms (default 10000). */
  timeoutMs?: number;
}

export interface SendEventResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const EVENT_NAME = /^[a-z][a-z0-9_]{1,40}(\.[a-z][a-z0-9_]{1,40}){1,3}$/;

/** The signature AI Employee checks: hex(HMAC-SHA256(secret, "<timestamp>.<raw body>")). */
export function signWebhookBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/**
 * Tell AI Employee something happened in your system, e.g.
 * `await sendEvent('appointment.cancelled', { appointmentId, customerName, reason })`.
 * Automation rules in AI Employee react to these events.
 *
 * Never throws: a delivery problem must not break your own request. Check `ok`
 * if you care. Call it after your database transaction has committed.
 */
export async function sendEvent(event: string, data: Record<string, unknown> = {}, options: SendEventOptions = {}): Promise<SendEventResult> {
  const url = options.webhookUrl ?? process.env.AI_EMPLOYEE_WEBHOOK_URL;
  const secret = options.webhookSecret ?? process.env.AI_EMPLOYEE_WEBHOOK_SECRET;
  if (!url || !secret) return { ok: false, error: 'Set AI_EMPLOYEE_WEBHOOK_URL and AI_EMPLOYEE_WEBHOOK_SECRET (from AI Employee → Integrations).' };
  if (!EVENT_NAME.test(event)) return { ok: false, error: `Event name "${event}" must look like "booking.created" (lowercase, dot-separated).` };

  const retries = options.retries ?? 2;
  let last: SendEventResult = { ok: false, error: 'not sent' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    // Fresh timestamp per attempt: AI Employee rejects signatures older than 5 minutes.
    const raw = JSON.stringify({ ...data, event });
    const ts = String(Math.floor(Date.now() / 1000));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': signWebhookBody(secret, ts, raw) },
        body: raw,
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      if (res.ok) return { ok: true, status: res.status };
      const text = (await res.text().catch(() => '')).slice(0, 200);
      last = { ok: false, status: res.status, error: explainStatus(res.status, text) };
      if (res.status < 500 && res.status !== 429) return last; // retrying won't help
    } catch (err) {
      last = { ok: false, error: `AI Employee could not be reached: ${(err as Error).message}` };
    }
  }
  return last;
}

function explainStatus(status: number, text: string): string {
  if (status === 401) return 'AI Employee rejected the signature: check AI_EMPLOYEE_WEBHOOK_SECRET matches the secret it showed.';
  if (status === 404) return 'AI Employee does not know this webhook URL: copy AI_EMPLOYEE_WEBHOOK_URL again.';
  if (status === 400) return `AI Employee refused the event: ${text}`;
  return `AI Employee answered ${status}${text ? `: ${text}` : ''}`;
}
