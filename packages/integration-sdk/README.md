# ai-employee-integration-sdk

[![npm version](https://img.shields.io/npm/v/ai-employee-integration-sdk.svg)](https://www.npmjs.com/package/ai-employee-integration-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

The official TypeScript/Node.js SDK for connecting **external business systems** (salons, clinics, hotels, e-commerce stores, CRMs, ERPs, custom backends) to the **AI Employee Platform**.

Instead of manually implementing HTTP routes, request validation, headers, and error formatting, this SDK lets you register business actions with `registerAction()` and provide business knowledge with `registerKnowledge()`. It automatically exposes the standardized **AI Employee Integration API Contract** over Express, NestJS, Next.js, Fastify, Hono, or vanilla Node.js.

---

## Features

- ⚡ **Zero HTTP Boilerplate** — Exposes `GET /ai/actions`, `POST /ai/execute`, and `GET /ai/knowledge` in 3 lines of code.
- 🛡️ **Built-in Parameter Validation** — Validates input types (`string`, `number`, `boolean`, `date`, `object`, `array`) and required fields before your handlers run.
- 🔁 **Built-in Idempotency Cache** — Deduplicates repeated `POST /ai/execute` calls using `Idempotency-Key` headers (supports memory TTL or custom Redis/DB stores).
- 🔒 **Pluggable Authentication** — Out-of-the-box support for API Keys, Bearer Tokens, and custom request verifiers.
- 📚 **Dynamic Knowledge & Location Sync** — Feeds live business documentation, FAQs, pricing, and branch locations directly to AI Employee RAG agents.
- 🌐 **Multi-Framework Adapters** — First-class adapters for **Express**, **NestJS**, plus a framework-agnostic handler for **Next.js**, **Fastify**, **Hono**, **AWS Lambda**, and **Cloudflare Workers**.
- 📦 **TypeScript-First** — Full type definitions, autocomplete, and strict contract conformance out of the box.

---

## The Integration API Contract

This SDK implements the 3 standard endpoints required by the AI Employee platform:

| Endpoint | Method | Purpose |
|---|---|---|
| `{baseUrl}/ai/actions` | `GET` | Discovery: AI Employee learns what actions your system can perform and their parameter schemas. |
| `{baseUrl}/ai/execute` | `POST` | Execution: The Action Agent invokes an action with arguments when assisting customers. |
| `{baseUrl}/ai/knowledge` | `GET` | Knowledge & Locations: Optional feed syncs live business documents & branch locations into AI Employee RAG. |

---

## Installation

```bash
# Using npm
npm install ai-employee-integration-sdk

# Using pnpm
pnpm add ai-employee-integration-sdk

# Using yarn
yarn add ai-employee-integration-sdk

# Using bun
bun add ai-employee-integration-sdk
```

> **Peer Dependencies**: Install `express` if using the Express adapter, or `@nestjs/common` & `@nestjs/core` if using the NestJS adapter.

---

## Quickstart

### Option 1: Express

```ts
import express from 'express';
import {
  registerAction,
  registerKnowledge,
  createExpressRouter,
} from 'ai-employee-integration-sdk/express-adapter';

// 1. Register an action the AI Employee can call
registerAction({
  name: 'create_booking',
  description: 'Book an appointment for a customer',
  parameters: {
    customerName: { type: 'string', required: true, description: 'Customer full name' },
    serviceId: { type: 'string', required: true, description: 'ID of the service to book' },
    date: { type: 'string', required: true, description: 'ISO date (YYYY-MM-DD)' },
  },
  handler: async (data, ctx) => {
    // Execute your business logic (database query, third-party API, etc.)
    const booking = await myBookingService.create(data);
    return { bookingId: booking.id, status: 'CONFIRMED' };
  },
});

// 2. (Optional) Provide business knowledge & locations for AI answers
registerKnowledge(async () => ({
  documents: [
    {
      externalId: 'pricing-policy',
      title: 'Services & Pricing',
      content: 'Haircut: $40. Hair coloring: $90. Cancellation policy: 24h notice required.',
      format: 'markdown',
    },
  ],
  locations: [
    {
      externalId: 'loc_central',
      name: 'Downtown Salon',
      address: '100 Main Street, Suite 4',
      timezone: 'America/New_York',
      phone: '+1-555-0199',
    },
  ],
}));

// 3. Mount router onto your Express app
const app = express();
app.use(express.json());

app.use(
  '/ai',
  createExpressRouter({
    apiKey: process.env.AI_EMPLOYEE_API_KEY, // Optional: Protect routes with an API key
  }),
);

app.listen(4000, () => {
  console.log('AI Employee integration endpoints live at http://localhost:4000/ai');
});
```

---

### Option 2: NestJS

```ts
import { Module } from '@nestjs/common';
import { AiActionsModule, registerAction } from 'ai-employee-integration-sdk/nestjs-adapter';

// 1. Register actions during bootstrap or in a service constructor
registerAction({
  name: 'check_inventory',
  description: 'Check stock availability for a given product SKU',
  parameters: {
    sku: { type: 'string', required: true, description: 'Product SKU' },
  },
  handler: async (data) => {
    return { sku: data.sku, inStock: true, quantity: 15 };
  },
});

// 2. Import AiActionsModule into your AppModule
@Module({
  imports: [
    AiActionsModule.forRoot({
      apiKey: process.env.AI_EMPLOYEE_API_KEY,
    }),
  ],
})
export class AppModule {}
```

---

### Option 3: Next.js / Fastify / Hono / Standalone

Use the framework-agnostic `handleIntegrationRequest` dispatcher:

#### Next.js App Router (`app/api/ai/[...slug]/route.ts`):

```ts
import { handleIntegrationRequest, registerAction } from 'ai-employee-integration-sdk';
import { NextRequest, NextResponse } from 'next/server';

registerAction({
  name: 'get_order_status',
  description: 'Lookup order tracking by order ID',
  parameters: {
    orderId: { type: 'string', required: true },
  },
  handler: async (data) => ({ orderId: data.orderId, status: 'SHIPPED' }),
});

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '');
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : undefined;

  const response = await handleIntegrationRequest(
    {
      method: req.method,
      path,
      headers: Object.fromEntries(req.headers.entries()),
      body,
    },
    { apiKey: process.env.AI_EMPLOYEE_API_KEY },
  );

  return NextResponse.json(response.body, { status: response.status });
}

export { handler as GET, handler as POST };
```

---

## Detailed Guide

### 1. Registering Actions & Validation

Actions represent capabilities the AI Employee's **Action Agent** can trigger when conversing with customers.

```ts
import { registerAction } from 'ai-employee-integration-sdk';

registerAction({
  name: 'cancel_booking',
  description: 'Cancel an existing customer booking with a reason',
  parameters: {
    bookingId: {
      type: 'string',
      required: true,
      description: 'The unique booking ID to cancel',
    },
    reason: {
      type: 'string',
      required: false,
      description: 'Optional cancellation reason provided by customer',
    },
    refundRequested: {
      type: 'boolean',
      required: false,
      description: 'Whether customer asked for a refund',
    },
  },
  handler: async (data, context) => {
    // `data` has been validated against `parameters` schema
    const { bookingId, reason } = data;

    // Optional: access request context
    console.log('Idempotency key:', context?.idempotencyKey);

    const result = await bookingService.cancel(bookingId, reason);
    return { cancelled: true, refundIssued: result.refundAmount > 0 };
  },
});
```

#### Supported Parameter Types:
- `string` / `text` — Text strings.
- `number` / `integer` / `float` — Numeric values.
- `boolean` / `bool` — `true` or `false`.
- `date` / `datetime` — ISO 8601 strings or timestamps.
- `object` — Key-value objects.
- `array` / `list` — Arrays of items.

#### Error Handling in Handlers:
If an action encounters a handled business problem (e.g. "Booking not found"), you can return `{ success: false, message: '...' }` or throw an `Error`. The SDK will safely format this into an `ExecuteActionResponse` without crashing your server.

```ts
handler: async (data) => {
  const booking = await findBooking(data.bookingId);
  if (!booking) {
    return { success: false, message: `Booking "${data.bookingId}" does not exist` };
  }
  return { status: booking.status };
};
```

---

### 2. Providing Business Knowledge & Locations

`registerKnowledge()` enables the AI Employee's **Knowledge Agent** to answer questions directly from your system's live documentation and branch locations.

```ts
import { registerKnowledge } from 'ai-employee-integration-sdk';

registerKnowledge(async () => {
  // Fetch dynamic content from your database or CMS
  const services = await db.services.findMany();
  const branches = await db.branches.findMany();

  return {
    documents: [
      {
        externalId: 'services-list',
        title: 'Available Services and Pricing',
        format: 'markdown',
        content: services.map(s => `- **${s.name}**: $${s.price}`).join('\n'),
      },
      {
        externalId: 'refund-policy',
        title: 'Return and Refund Policy',
        format: 'text',
        content: 'Full refunds granted within 48 hours of purchase.',
      },
    ],
    locations: branches.map(b => ({
      externalId: String(b.id),
      name: b.name,
      address: b.fullAddress,
      timezone: b.timezone || 'America/New_York',
      phone: b.contactPhone,
    })),
  };
});
```

---

### 3. Authentication & Security

Protect your endpoints against unauthorized requests:

#### API Key Authentication:
```ts
createExpressRouter({
  apiKey: 'sk_live_my_super_secret_key_123',
  apiKeyHeader: 'x-api-key', // Defaults to 'x-api-key'
});
```

#### Bearer Token (JWT / OAuth2):
```ts
createExpressRouter({
  bearerToken: 'eyJh...', // Expects Authorization: Bearer eyJh...
});
```

#### Custom Verification Callback:
```ts
createExpressRouter({
  verifyAuth: async (req) => {
    const signature = req.headers['x-hmac-signature'];
    return isValidSignature(signature, req.body);
  },
});
```

---

### 4. Idempotency & Safe Retries

When the AI Employee makes network calls, transient drops or timeouts may cause retries. The SDK includes an automatic **Idempotency Cache** to prevent executing business actions more than once for the same request.

#### Default In-Memory Store:
Enabled automatically with 24-hour TTL:
```ts
createExpressRouter({
  idempotencyTtlSeconds: 86400, // 24 hours
});
```

#### Distributed Redis Store (for Horizontal Scaling / Multiple Instances):
Implement the simple `IdempotencyStore` interface:

```ts
import type { IdempotencyStore, ExecuteActionResponse } from 'ai-employee-integration-sdk';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export class RedisIdempotencyStore implements IdempotencyStore {
  async get(key: string): Promise<ExecuteActionResponse | undefined> {
    const data = await redis.get(`idempotency:${key}`);
    return data ? JSON.parse(data) : undefined;
  }

  async set(key: string, value: ExecuteActionResponse, ttlSeconds = 86400): Promise<void> {
    await redis.set(`idempotency:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  }
}

// Pass to adapter:
createExpressRouter({
  idempotencyStore: new RedisIdempotencyStore(),
});
```

---

## Testing Your Integration Locally

You can verify your endpoints using `curl` or any API client:

### 1. Discover Actions
```bash
curl http://localhost:4000/ai/actions -H "x-api-key: your-api-key"
```
**Response:**
```json
{
  "actions": [
    {
      "name": "create_booking",
      "description": "Book an appointment for a customer",
      "parameters": {
        "customerName": { "type": "string", "required": true, "description": "Customer full name" },
        "serviceId": { "type": "string", "required": true, "description": "ID of the service to book" }
      }
    }
  ]
}
```

### 2. Execute an Action
```bash
curl -X POST http://localhost:4000/ai/execute \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -H "Idempotency-Key: test-req-001" \
  -d '{
    "action": "create_booking",
    "data": {
      "customerName": "Jane Doe",
      "serviceId": "srv_123"
    }
  }'
```
**Response:**
```json
{
  "success": true,
  "message": "create_booking executed successfully",
  "data": {
    "bookingId": "bk_9981",
    "status": "CONFIRMED"
  }
}
```

### 3. Fetch Knowledge
```bash
curl http://localhost:4000/ai/knowledge -H "x-api-key: your-api-key"
```

---

## Connecting to the AI Employee Platform

Once your business server is running with the SDK:

1. Log into your **AI Employee Platform Dashboard**.
2. Navigate to **Integrations** -> **Add New Integration**.
3. Fill in the integration details:
   - **Name**: e.g., `My Salon System`
   - **Base URL**: e.g., `https://api.mysalon.com` (or your ngrok URL for local dev)
   - **Auth Type**: Select `API Key`, `Bearer Token`, or `None` matching your config.
   - **API Key**: Enter the key you configured in `createExpressRouter({ apiKey: '...' })`.
4. Click **Discover Actions** — AI Employee will connect to `GET /ai/actions` and index your capabilities.
5. Click **Sync Knowledge** — AI Employee will sync your documents and locations for RAG.

Your AI Employee is now connected and ready to assist real customers!

---

## Maintainer Guide: Building & Publishing to NPM

### 1. Build & Run Tests
```bash
# Build TypeScript to dist/
pnpm build

# Run automated tests
pnpm test
```

### 2. Verify Package Contents
```bash
npm pack --dry-run
```

### 3. Publish to NPM Registry
```bash
# Login to your NPM account (one time)
npm login

# Publish public scoped package
npm publish --access public
```

### 4. Automated CI/CD (GitHub Actions)
Add `.github/workflows/publish.yml`:
```yaml
name: Publish to NPM
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install
      - run: pnpm --filter ai-employee-integration-sdk build
      - run: pnpm --filter ai-employee-integration-sdk test
      - run: pnpm --filter ai-employee-integration-sdk publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## API Reference

### Core Functions
- `registerAction(definition: ActionDefinition): void` — Registers an action and its parameter schema.
- `unregisterAction(name: string): void` — Removes an action by name.
- `getRegisteredActions(): ActionDefinition[]` — Returns all registered action definitions.
- `getRegisteredAction(name: string): ActionDefinition | undefined` — Looks up a specific action.
- `clearRegisteredActions(): void` — Clears all actions (useful in test suites).
- `registerKnowledge(provider: KnowledgeProvider | null): void` — Registers dynamic knowledge & locations provider.
- `resolveKnowledgeResponse(): Promise<ListKnowledgeResponse>` — Resolves current knowledge payload.
- `executeRegisteredAction(name, data, context?): Promise<ExecuteActionResponse>` — Direct validation & execution helper.
- `handleIntegrationRequest(req, options?): Promise<IntegrationHttpResponse>` — Framework-agnostic HTTP dispatcher.

### Adapters
- `createExpressRouter(options?: ExpressAdapterOptions): Router` — Express.js middleware router.
- `AiActionsModule.forRoot(options?: NestAdapterOptions): DynamicModule` — NestJS dynamic module.
- `AiActionsController` — NestJS controller.

### Utilities & Classes
- `MemoryIdempotencyStore` — In-memory TTL cache for idempotency deduplication.
- `validateActionData(definition, data)` — Parameter schema validation engine.
- `checkAuth(options, req)` — Request authentication validator.

---

## License

[MIT](LICENSE) © AI Employee Platform Contributors
