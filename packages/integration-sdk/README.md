# @ai-employee/integration-sdk

SDK for **external business systems** (a salon, hotel, clinic, e-commerce store, CRM,
...) to become AI-Employee-compatible without writing any HTTP plumbing themselves.
This package is standalone — it is published for *other* codebases to install; it is
not part of the `apps/api` build in this monorepo.

It implements the AI Employee Integration API Contract:

```
GET  {baseUrl}/ai/actions   -> { "actions": [{ "name", "description", "parameters" }, ...] }
POST {baseUrl}/ai/execute   -> { "success": true, "message": "...", "data": { ... } }
```

## Install

```bash
npm install @ai-employee/integration-sdk
# plus whichever server framework you use:
npm install express            # if using createExpressRouter()
npm install @nestjs/common @nestjs/core   # if using AiActionsModule
```

## Usage

```ts
import { registerAction, createExpressRouter } from '@ai-employee/integration-sdk';
import express from 'express';

registerAction({
  name: 'create_booking',
  description: 'Create a new booking',
  parameters: {
    customer_id: { type: 'string', required: true },
    date: { type: 'string', required: true },
    time: { type: 'string', required: true },
  },
  handler: async (data) => {
    // ... your business logic (DB write, calendar API, etc.) ...
    return { booking_id: 'ABC123' };
  },
});

const app = express();
app.use(express.json());
app.use('/ai', createExpressRouter()); // exposes GET /ai/actions, POST /ai/execute
app.listen(4000);
```

### NestJS consumers

```ts
import { Module } from '@nestjs/common';
import { AiActionsModule, registerAction } from '@ai-employee/integration-sdk';

registerAction({ name: 'check_availability', description: '...', parameters: {}, handler: async () => ({}) });

@Module({ imports: [AiActionsModule] })
export class AppModule {}
```

## API

- `registerAction(definition: ActionDefinition): void`
- `getRegisteredActions(): ActionDefinition[]`
- `getRegisteredAction(name: string): ActionDefinition | undefined`
- `unregisterAction(name: string): void`
- `createExpressRouter(): express.Router`
- `AiActionsController`, `AiActionsModule` (NestJS)

See `src/types.ts` for the full `ActionDefinition` / `ActionParameter` shapes.

Both `express` and `@nestjs/common`/`@nestjs/core` are declared as *optional*
`peerDependencies` — install only the one matching your framework. Note: importing the
package's top-level barrel (`@ai-employee/integration-sdk`) currently loads both adapter
modules eagerly; if you want to avoid a hard dependency on the framework you're not
using, import the specific adapter subpath instead (see `src/index.ts` comment).
