# AI Employee Platform — Complete Setup & Operations Guide

A comprehensive, production-ready guide to installing, configuring, running, maintaining, and operating the **AI Employee Platform**.

---

## 1. System Overview & Architecture

The AI Employee Platform is a monorepo containing:
- **Web Dashboard (`apps/web`)**: Next.js 14 App Router, React 18, Tailwind CSS, TanStack Query, and Lucide UI icons.
- **Backend API (`apps/api`)**: NestJS 10, Prisma ORM, PostgreSQL (with pgvector), Redis, BullMQ, and WebSocket gateways.
- **Integration Engine (`packages/integration-sdk`)**: Type-safe SDK for external systems (Salon, Retail, Clinic, Restaurant, CRM, ERP).
- **Workflow Automation (`n8n/`)**: n8n container integration for complex external logic.

```mermaid
graph TD
    Client["Business Owner / Web Browser"] --> NextJS["Next.js Web Client (Port 3000)"]
    Customer["Customer (WhatsApp / Web Chat)"] --> API["NestJS API (Port 3001)"]
    NextJS --> API
    API --> Postgres["PostgreSQL + pgvector (Port 5432)"]
    API --> Redis["Redis Cache & Queue (Port 6379)"]
    API --> n8n["n8n Workflow Engine (Port 5678)"]
    API --> LLM["AI Providers (Anthropic / OpenAI / Gemini)"]
```

---

## 2. Prerequisites & System Requirements

Before running the platform, ensure the following are installed:
- **Node.js**: `v20.0.0` or higher
- **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
- **Docker & Docker Compose**: Docker Desktop or Docker Engine running
- **Operating System**: macOS, Linux, or Windows (WSL2 recommended)

Verify your environment:
```bash
node -v      # Expected >= v20.x
pnpm -v      # Expected >= v9.x
docker compose version
```

---

## 3. One-Command Quick Start (Recommended)

Get the complete platform running in less than 60 seconds:

```bash
# 1. Install dependencies, start Docker containers, apply schema, and seed clean accounts
./install.sh

# 2. Start the dev servers (clears ports, launches API + Web, and monitors logs)
./start.sh
```

Once running, access the platform:
- 🌐 **Business Owner Dashboard**: [http://localhost:3000](http://localhost:3000)
- ⚙️ **Platform Admin Console**: [http://localhost:3000/admin](http://localhost:3000/admin)
- 🔌 **Backend API**: [http://localhost:3001](http://localhost:3001)
- 📚 **Swagger API Documentation**: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- 🔄 **n8n Automation Engine**: [http://localhost:5678](http://localhost:5678)

---

## 4. Manual Step-by-Step Setup

If you prefer to run each step manually:

### Step 1: Environment Variables Configuration
Copy the example environment file:
```bash
cp .env.example .env
```
Open `.env` and verify key settings (see [Environment Variables Reference](#7-environment-variables-reference) below).

### Step 2: Install Dependencies
```bash
pnpm install
```

### Step 3: Start Infrastructure Containers
Start PostgreSQL, Redis, and n8n in the background:
```bash
docker compose up -d postgres redis n8n
```

Verify containers are healthy:
```bash
docker compose ps
```

### Step 4: Database Schema Initialization & Client Generation
```bash
pnpm prisma:generate
pnpm --filter @ai-employee/api exec prisma db push
```

### Step 5: Seed Pristine Demo Accounts
```bash
pnpm prisma:seed
```

### Step 6: Start Development Servers
```bash
pnpm dev
```
Both the API (`localhost:3001`) and Web (`localhost:3000`) will compile and hot-reload.

---

## 5. Cleaning & Resetting the Database

If you have performed manual tests or want a pristine, fresh database state with clean demo data:

### Clean & Re-seed in One Command
```bash
pnpm db:clean
```
*(Or `pnpm db:reset`)*

This command:
1. Completely drops all tables and orphaned test records.
2. Recreates the PostgreSQL database schema from `prisma/schema.prisma`.
3. Seeds pristine demo accounts, AI employees, store branches, and sample conversations.

### Inspecting Database via Prisma Studio
To inspect tables and records visually in your browser:
```bash
pnpm prisma:studio
```
Opens interactive Prisma Studio at [http://localhost:5555](http://localhost:5555).

---

## 6. Default Demo Accounts & Login Credentials

Every fresh installation or database reset includes these default accounts:

| Business / Role | Email | Password | Access Scope & Description |
| :--- | :--- | :--- | :--- |
| **Platform Super Admin** | `platform@davinlabs.com` | `ChangeMe123!` | Standalone Super Admin. Full cross-tenant access at `/admin`. |
| **Super Admin + Tenant Owner** | `admin@davinlabs.com` | `ChangeMe123!` | Super Admin who also owns the "DavinLabs" workspace. |
| **Business Owner (Acme Salon)** | `owner@acme.test` | `ChangeMe123!` | Primary Business Owner of Acme Salon & Spa. Full access across all branches. |
| **Store Manager** | `manager@acme.test` | `ChangeMe123!` | Manager Access. Assigned to Downtown branch. |
| **Store Cashier** | `cashier@acme.test` | `ChangeMe123!` | Limited Access (POS checkout only). Assigned to Downtown branch. |
| **Lead Hair Stylist** | `stylist@acme.test` | `ChangeMe123!` | Standard Access. Assigned to Airport branch. |

> [!TIP]
> **Promoting Any Account to Super Admin**:
> To promote any existing user to platform super admin:
> ```bash
> pnpm --filter @ai-employee/api run promote-admin <email>
> ```

---

## 7. Environment Variables Reference

Key configuration settings in `.env`:

```ini
# ========================================================
# Database & Cache
# ========================================================
DATABASE_URL="postgresql://ai_employee:ai_employee_secret@localhost:5432/ai_employee?schema=public"
REDIS_URL="redis://localhost:6379"

# ========================================================
# Authentication & Security
# ========================================================
JWT_ACCESS_SECRET="your-256-bit-secret-access-token-key-change-in-prod"
JWT_REFRESH_SECRET="your-256-bit-secret-refresh-token-key-change-in-prod"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# ========================================================
# Ports & Host
# ========================================================
PORT=3001
NEXT_PUBLIC_API_URL="http://localhost:3001"
DEFAULT_TIMEZONE="Asia/Colombo"

# ========================================================
# AI Providers (At least one required for live AI execution)
# ========================================================
ANTHROPIC_API_KEY=""       # Claude 3.5 Sonnet / Haiku
OPENAI_API_KEY=""          # GPT-4o / GPT-4o-mini
GEMINI_API_KEY=""          # Google Gemini 1.5 Pro / Flash

# ========================================================
# Automation & External Channels
# ========================================================
N8N_WEBHOOK_BASE_URL="http://localhost:5678/webhook"
WHATSAPP_VERIFY_TOKEN="ai_employee_wa_verify_token"
```

---

## 8. Business Owner Operations Guide

### A. First-Time Registration & Setup
1. Navigate to [http://localhost:3000/signup](http://localhost:3000/signup).
2. Enter **Full Name**, **Email**, and **Password**. Click **Create Account**.
3. You are automatically guided into the **Business Setup Wizard (`/onboarding`)**:
   - **Step 1**: Choose Business Name, Industry (Salon, Retail, Clinic, Restaurant, etc.), Country, and Currency.
   - **Step 2**: Select Scale (Single Store vs Multi-Branch).
   - **Step 3**: Review auto-recommended AI Employees matching your business type.
   - **Step 4**: One-click Launch straight into your executive dashboard.

### B. Daily Management & Dashboard (`/dashboard`)
- **Executive KPIs**: View today's Assisted Sales ($), Orders Assisted, and Conversations.
- **AI Employees Live Status**: Displays working status (`● Working` / `○ Paused`). Use the 1-click toggle to pause or resume any AI worker instantly.
- **Needs Your Attention**: High-priority alert banner for pending Level-2 authorizations (e.g. discount approvals) and pending team member invitations.
- **Plain-English Activity Feed**: Real-time business activity written in natural language.

### C. Team & Staff Management (`/team`)
- **Distinction**: A visible banner clearly distinguishes **Human Team Members** from **AI Employees**.
- **Adding Staff**: Click `+ Add Team Member` to launch the 4-step wizard:
  1. *Employee Info*: Name, Email, Phone.
  2. *Role & Access*: Select predefined business role (*Cashier*, *Manager*, *Stylist*) and access level preset (*Full*, *Manager*, *Standard*, *Limited*, *Custom*).
  3. *Branch Access*: "All Locations" or specific branches.
  4. *Review & Invite*: Submit and view one-time generated login credentials.
- **Ownership Protection**: Non-owners cannot delete or demote the business owner. Disabling a user terminates their login session immediately while preserving historical sales data.

### D. Store & Branch Locations (`/locations`)
- Manage multi-branch locations (e.g. *Downtown*, *Airport*).
- Staff assigned to specific branches are strictly isolated from customer data in other branches.

### E. Customer Channels (`/channels`)
- Connect customer touchpoints:
  - **Website Live Chat**: Copy the 1-line HTML embed snippet to your website.
  - **WhatsApp**: Configure Meta Cloud API webhook URL and verify token.

### F. Business Information & Documents (`/knowledge-base`)
- Upload PDF, DOCX, or text files containing menus, pricing, services, and policies.
- AI employees automatically query these documents via semantic search (RAG) to answer customer questions accurately.

---

## 9. Automated Verification & Testing

The repository includes complete end-to-end test suites verifying security, multitenancy, and business flows:

```bash
# 1. Run User Management E2E Test (28 checks: permissions, ownership protection, branch isolation)
pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/test-user-management-e2e.ts

# 2. Run GlowDesk Salon E2E Test (14 checks: onboarding, Level-2 approvals, 1-click pause switch)
pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/test-glowdesk-business-flow.ts

# 3. Run Full AI Employee E2E Test (34 checks: 3-level action guardrails, templates, audit stream)
pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/test-ai-employee-e2e.ts
```

### Production Build Verification
Verify that both applications build with 0 errors:
```bash
# Build API backend
pnpm --filter @ai-employee/api build

# Build Web frontend (compiles all 21 routes)
pnpm --filter @ai-employee/web build
```

---

## 10. Troubleshooting & Common Issues

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **Port 3000 or 3001 already in use** | A previous Node process was left running. | Run `./start.sh` (it automatically kills stale processes on ports 3000/3001) or run `lsof -ti:3000 -ti:3001 \| xargs kill -9`. |
| **Docker container postgres unhealthy** | Docker Desktop is stopped or port 5432 is in use by a local Postgres service. | Stop local postgres (`brew services stop postgresql`) and run `docker compose restart postgres`. |
| **Missing database schema error** | Schema has not been synced to PostgreSQL. | Run `pnpm db:clean` or `pnpm --filter @ai-employee/api exec prisma db push`. |
| **Cannot log in after password change** | Stale auth session in browser localStorage. | Open browser DevTools $\rightarrow$ Application $\rightarrow$ Clear Local Storage, then log in with seeded credentials. |
| **AI Employee answers with error** | No LLM API key configured in `.env`. | Add an API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) to `.env` and restart dev servers. |
