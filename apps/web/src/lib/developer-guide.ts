/** Everything a developer needs, filled in for one connection. Shown once. */
export interface DeveloperKit {
  name: string;
  apiKey: string;
  webhookUrl: string;
  webhookSecret: string;
}

export function envBlock(kit: DeveloperKit): string {
  return [
    `AI_EMPLOYEE_API_KEY=${kit.apiKey}`,
    `AI_EMPLOYEE_WEBHOOK_URL=${kit.webhookUrl}`,
    `AI_EMPLOYEE_WEBHOOK_SECRET=${kit.webhookSecret}`,
  ].join("\n");
}

const fence = "```";

/** Markdown guide the owner forwards to their developer. */
export function developerGuide(kit: DeveloperKit, businessName?: string): string {
  return `# Connect "${kit.name}" to AI Employee

${businessName ? `For **${businessName}**. ` : ""}AI Employee is the business's AI team. Connecting your software lets it
look things up and take actions (for example check availability or create a booking),
answer customers from your real data, and react to events (for example a cancelled booking).

## 1. Your settings — keep them secret

Put these in your server's environment (\`.env\`). Never commit them to git.

${fence}env
${envBlock(kit)}
${fence}

## 2. Node.js (Express, NestJS, Next.js): one command

Inside your backend project, after adding the settings above:

${fence}bash
npx ai-employee-integration-sdk init
${fence}

It installs the SDK and writes a starter file. Replace the example action with real ones that
call your existing code, for example:

${fence}ts
registerAction({
  name: 'create_booking',
  description: 'Book an appointment. Use a time returned by check_availability.',
  parameters: {
    customerPhone: { type: 'string', required: true, description: 'Customer phone, e.g. +94771234567' },
    service: { type: 'string', required: true, description: 'Service name' },
    startsAt: { type: 'string', required: true, description: 'ISO date-time' },
  },
  handler: async (data) => {
    const booking = await bookings.create(data); // your existing code
    return { bookingId: booking.id, startsAt: booking.startsAt };
  },
});
${fence}

Report events after your database change is saved:

${fence}ts
import { sendEvent } from 'ai-employee-integration-sdk/events';
await sendEvent('booking.cancelled', { bookingId, customerName, reason });
${fence}

## 3. Any other language (Python, PHP, Go, Java …)

Add three JSON endpoints under one base address. Every request from AI Employee carries
\`X-API-Key: <AI_EMPLOYEE_API_KEY>\`; answer **401** if it is missing or wrong.

| Endpoint | What to return |
|---|---|
| \`GET /ai/actions\` | \`{ "actions": [ { "name": "create_booking", "description": "...", "parameters": { "service": { "type": "string", "required": true, "description": "..." } } } ] }\` |
| \`POST /ai/execute\` | Body \`{ "action": "create_booking", "data": { ... } }\` → \`{ "success": true, "message": "...", "data": { ... } }\`. On a business error still answer 200 with \`"success": false\`. Repeat the first answer for a repeated \`Idempotency-Key\` header. |
| \`GET /ai/knowledge\` (optional) | \`{ "documents": [ { "externalId": "prices", "title": "Prices", "content": "A haircut is Rs 45 ..." } ] }\` |

Events: POST JSON with an \`"event"\` field (like \`"booking.cancelled"\`) to the webhook URL, signed:

${fence}python
import hmac, hashlib, json, time, requests, os
body = json.dumps({"event": "booking.cancelled", "bookingId": "b1"})
ts = str(int(time.time()))
sig = hmac.new(os.environ["AI_EMPLOYEE_WEBHOOK_SECRET"].encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
requests.post(os.environ["AI_EMPLOYEE_WEBHOOK_URL"], data=body,
              headers={"Content-Type": "application/json", "X-Timestamp": ts, "X-Signature": sig})
${fence}

${fence}php
$body = json_encode(['event' => 'booking.cancelled', 'bookingId' => 'b1']);
$ts = (string) time();
$sig = hash_hmac('sha256', "$ts.$body", getenv('AI_EMPLOYEE_WEBHOOK_SECRET'));
// POST $body to getenv('AI_EMPLOYEE_WEBHOOK_URL') with headers Content-Type: application/json, X-Timestamp: $ts, X-Signature: $sig
${fence}

## 4. Check your work

${fence}bash
npx ai-employee-integration-sdk verify --url https://your-api.example.com
${fence}

It checks the endpoints answer with the key, refuse requests without it, and that a signed
test event reaches AI Employee. Run it in the folder with your \`.env\`, or set the three settings
as environment variables first. It only makes HTTP calls, so it works whatever language your
server is written in (it needs Node.js installed on your computer).

## 5. Send back to the business owner

Your **Base URL**: the address where \`/ai/actions\` lives, without \`/ai/actions\`
(for example \`https://api.yourapp.com\`). They paste it into AI Employee and click **Test connection**.
`;
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
