# Production Deployment & External Project Integration Guide

This guide explains how to deploy the **AI Employee Platform** in production and how external business applications (such as **GlowDesk**, salon management systems, clinic software, CRM, or e-commerce platforms) can install, configure, and integrate seamlessly—with **strict fault isolation** guaranteeing that host projects are **never harmed** if AI Employee goes offline.

---

## Part 1: Zero-Harm Fault Isolation Architecture

### Core Invariant: Decoupled & Non-Blocking
AI Employee is strictly an **optional, asynchronous intelligence & customer communication layer**. It is **never in the critical operational path** of your host business system (GlowDesk).

```
┌─────────────────────────────────────────────────────────────┐
│                      GlowDesk (Host App)                     │
│  ┌───────────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ Bookings/Calendar │  │ POS / Payment │  │ Customer DB │  │
│  └───────────────────┘  └───────────────┘  └─────────────┘  │
│           │                     │                           │
│  ┌────────▼─────────────────────▼────────────────────────┐  │
│  │   Integration Router: /ai/actions, /ai/execute        │  │
│  │   (Defensive try/catch; independent process)          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────▲───────────────────────────────────┘
                          │ HTTP (/ai/execute, 15s timeout, Idempotency-Key)
                          │ If AI Employee is DOWN:
                          │ ❌ Zero calls received
                          │ ❌ GlowDesk functions at 100%
┌─────────────────────────▼───────────────────────────────────┐
│                    AI Employee Platform                     │
│  ┌─────────────┐   ┌────────────────┐   ┌────────────────┐  │
│  │ NestJS API  │──▶│  Multi-Agent   │──▶│ n8n / Workflow │  │
│  │  (/health)  │   │  Router/Action │   │   Automation   │  │
│  └─────────────┘   └────────────────┘   └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Why GlowDesk is 100% Safe If AI Employee Goes Down:

| Scenario / Failure Mode | What Happens to AI Employee | What Happens to GlowDesk | Safety Guarantee |
|---|---|---|---|
| **AI Employee API crashes / stops** | AI Employee stops accepting requests | GlowDesk continues operating without interruption | **100% Isolated.** GlowDesk does not call AI Employee for its core operations (creating bookings, taking payments, managing staff). |
| **OpenAI / LLM Outage or Rate Limit** | AI Employee returns fallback error | GlowDesk operations are completely unaffected | Action Agent catches LLM failure and halts action execution gracefully. |
| **Website Chat Widget Connection Failure** | Widget receives connection error / timeout | GlowDesk website loads normally | Widget script is loaded with `async`. Network failures are caught silently with backoff; user sees an offline note without broken page UI. |
| **Database Failure in AI Employee** | Health check reports `503`, container restarts | GlowDesk's PostgreSQL database is separate and untouched | Complete database isolation; zero shared tables or connections. |
| **Network Timeout during Action Call** | AI Employee times out after 15s | GlowDesk handler completes or drops connection | AI Employee sends `Idempotency-Key` on any retry, preventing duplicate bookings or charges. |

---

## Part 2: 5-Minute Setup for GlowDesk (or Any Project)

### Step 1: Install the Integration SDK in GlowDesk

In the GlowDesk repository:

```bash
npm install @ai-employee/integration-sdk
```

*(Note: For Python/FastAPI, PHP/Laravel, or Go, see the raw HTTP contract in `docs/integration-api-contract.md`)*.

---

### Step 2: Register GlowDesk Actions & Mount Router

In your GlowDesk backend (Express or NestJS):

#### Express Example:
```typescript
import express from 'express';
import { registerAction, registerKnowledge, createExpressRouter } from '@ai-employee/integration-sdk';
import { bookingService, servicesService } from './services';

const app = express();
app.use(express.json());

// 1. Register Action: Check Availability
registerAction({
  name: 'check_availability',
  description: 'Check available appointment slots for a given service and date',
  parameters: {
    serviceId: { type: 'string', required: true, description: 'ID or name of the salon service' },
    date: { type: 'string', required: true, description: 'Date in YYYY-MM-DD format' },
  },
  handler: async (data) => {
    const slots = await bookingService.getAvailableSlots(data.serviceId as string, data.date as string);
    return { availableSlots: slots };
  },
});

// 2. Register Action: Create Booking
registerAction({
  name: 'create_booking',
  description: 'Book a new appointment for a customer',
  parameters: {
    customerName: { type: 'string', required: true, description: 'Customer full name' },
    customerPhone: { type: 'string', required: true, description: 'Customer phone number' },
    serviceId: { type: 'string', required: true, description: 'Service ID' },
    startTime: { type: 'string', required: true, description: 'Start time in ISO 8601 format' },
  },
  handler: async (data) => {
    const booking = await bookingService.create(data);
    return { bookingId: booking.id, status: 'confirmed' };
  },
});

// 3. (Optional) Register Knowledge: Services, Pricing & Locations
registerKnowledge(async () => ({
  documents: [
    {
      externalId: 'services-and-pricing',
      title: 'Services & Pricing',
      format: 'markdown',
      content: await servicesService.getPricingMarkdown(),
    },
    {
      externalId: 'opening-hours-and-policies',
      title: 'Opening Hours & Cancellation Policy',
      content: 'Open Monday-Saturday 9am-8pm. Cancellations must be made 24h in advance.',
    },
  ],
  locations: [
    {
      externalId: 'main-salon',
      name: 'GlowDesk Main Salon',
      timezone: 'America/New_York',
      address: '123 Beauty Lane, New York, NY',
      phone: '+1-555-0199',
    },
  ],
}));

// 4. Mount the AI routes at /ai
app.use('/ai', createExpressRouter());

app.listen(3141, () => {
  console.log('GlowDesk running on port 3141 with /ai routes active');
});
```

#### NestJS Example:
```typescript
import { Module } from '@nestjs/common';
import { AiActionsModule, registerAction } from '@ai-employee/integration-sdk';

registerAction({
  name: 'check_availability',
  description: 'Check available appointment slots',
  parameters: { date: { type: 'string', required: true } },
  handler: async (data) => ({ slots: ['10:00 AM', '02:00 PM'] }),
});

@Module({
  imports: [AiActionsModule],
})
export class AppModule {}
```

---

### Step 3: Connect GlowDesk in AI Employee Platform

Run the automated discovery & sync script or connect via the dashboard UI:

```bash
# From the AI Employee platform root:
pnpm --filter @ai-employee/api run ts-node scripts/setup-glowdesk.ts
```

Or in the AI Employee Web Dashboard:
1. Navigate to **Integrations** -> **Add Integration**.
2. Name: `GlowDesk`
3. Base URL: `http://localhost:3141` (or your GlowDesk production URL `https://api.glowdesk.com`).
4. Click **Discover Actions** (AI Employee automatically registers all available actions).
5. Click **Sync Knowledge** (AI Employee ingests documents & mirrors locations).

---

### Step 4: Embed the Live Chat Widget in GlowDesk's Website

Add this single line to GlowDesk's frontend HTML/React layout:

```html
<script
  src="https://ai.yourcompany.com/channels/website-chat/widget.js"
  data-channel-id="<YOUR_CHANNEL_ID>"
  async>
</script>
```

---

## Part 3: Production Deployment Guide

### 1. Production Architecture Overview

In production, run the pre-configured Docker stack behind a reverse proxy (Nginx, Traefik, Caddy, or Cloudflare):

```
                        HTTPS (443)
                             │
                      ┌──────▼──────┐
                      │ Nginx/Proxy │
                      └──────┬──────┘
             ┌───────────────┼───────────────┐
             │               │               │
        /api/*, /health     /*             /n8n/*
             │               │               │
      ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
      │  apps/api   │ │  apps/web   │ │     n8n     │
      │ (Port 3001) │ │ (Port 3000) │ │ (Port 5678) │
      └──────┬──────┘ └─────────────┘ └──────┬──────┘
             │                               │
             ├───────────────┬───────────────┘
             │               │
      ┌──────▼──────┐ ┌──────▼──────┐
      │  PostgreSQL │ │    Redis    │
      │  (pgvector) │ │ (Queue/Bus) │
      └─────────────┘ └─────────────┘
```

---

### 2. Environment Variables Checklist (`.env`)

Configure the following for production:

```env
# Node Environment
NODE_ENV=production

# URLs
API_URL=https://ai-api.yourdomain.com
NEXT_PUBLIC_API_URL=https://ai-api.yourdomain.com
WEB_URL=https://ai.yourdomain.com

# PostgreSQL with pgvector
POSTGRES_USER=ai_employee_prod
POSTGRES_PASSWORD=your-super-strong-db-password-here
POSTGRES_DB=ai_employee
DATABASE_URL=postgresql://ai_employee_prod:your-super-strong-db-password-here@postgres:5432/ai_employee?schema=public

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379

# Security & Secrets
JWT_SECRET=your-256-bit-random-secret-for-jwt-signing
JWT_REFRESH_SECRET=your-256-bit-random-secret-for-jwt-refresh
CREDENTIALS_ENCRYPTION_KEY=32-character-hex-or-string-for-credentials-encryption

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# n8n Automation
N8N_ENCRYPTION_KEY=your-n8n-encryption-key
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-n8n-password
N8N_WEBHOOK_URL=https://n8n.yourdomain.com/
```

---

### 3. Deploying with Docker Compose

1. Build and start containers:
```bash
docker compose -f docker-compose.yml up -d --build
```

2. Run database migrations:
```bash
docker compose exec api pnpm prisma:migrate
```

3. Seed initial Super Admin account:
```bash
docker compose exec api pnpm prisma:seed
```

4. Verify health:
```bash
curl https://ai-api.yourdomain.com/health
```

Expected Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-09-02T12:00:00.000Z",
  "uptimeSeconds": 1420,
  "responseTimeMs": 4,
  "services": {
    "database": "up",
    "api": "up"
  }
}
```

---

### 4. Backups & Disaster Recovery

- **PostgreSQL Backup**:
  ```bash
  docker compose exec postgres pg_dump -U ai_employee_prod ai_employee > backup_$(date +%Y%m%d).sql
  ```
- **Prisma Schema Rollbacks**: Standard migrations are tracked in `prisma/migrations/`.
- **Zero Impact on Clients**: Since tenant action catalogues and knowledge bases can be re-discovered in seconds (`GET /ai/actions` and `GET /ai/knowledge`), disaster recovery takes under 2 minutes with zero data loss to external business systems.
