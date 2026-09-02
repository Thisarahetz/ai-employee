import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { MemoryIdempotencyStore } from './idempotency';
import {
  checkAuth,
  executeRegisteredAction,
  listRegisteredActionsResponse,
  resolveKnowledgeResponse,
} from './registry';
import type {
  ExecutionContext,
  ExecuteActionRequest,
  ExecuteActionResponse,
  ExpressAdapterOptions,
} from './types';

/**
 * Creates an Express router exposing the Integration API Contract endpoints off
 * whatever base path you mount it at.
 *
 * Mount at `/ai`:
 * ```ts
 * import express from 'express';
 * import { createExpressRouter } from '@ai-employee/integration-sdk/express-adapter';
 *
 * const app = express();
 * app.use(express.json());
 * app.use('/ai', createExpressRouter({
 *   apiKey: process.env.AI_EMPLOYEE_API_KEY,
 * }));
 * ```
 *
 * Exposes:
 * - `GET /ai/actions`
 * - `GET /ai/knowledge`
 * - `POST /ai/execute`
 */
export function createExpressRouter(options: ExpressAdapterOptions = {}): Router {
  const router = Router();

  // Configure idempotency store unless explicitly disabled
  const idempotencyStore = options.disableIdempotency
    ? undefined
    : options.idempotencyStore || new MemoryIdempotencyStore({
        defaultTtlSeconds: options.idempotencyTtlSeconds,
      });

  // Authentication middleware
  const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAuthorized = await checkAuth(options, req);
      if (!isAuthorized) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      next();
    } catch (error) {
      res.status(401).json({ success: false, message: 'Authentication failed' });
    }
  };

  router.use(authMiddleware);

  /**
   * GET /actions
   * Returns list of registered actions and parameter schemas for discovery.
   */
  router.get('/actions', (_req: Request, res: Response) => {
    try {
      res.json(listRegisteredActionsResponse());
    } catch (error) {
      res.status(500).json({
        actions: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /knowledge
   * Returns business documents & locations for AI RAG.
   */
  router.get('/knowledge', async (_req: Request, res: Response) => {
    try {
      res.json(await resolveKnowledgeResponse());
    } catch (error) {
      res.json({ documents: [], locations: [] });
    }
  });

  /**
   * POST /execute
   * Executes a registered action with parameter validation and optional idempotency deduplication.
   */
  router.post('/execute', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ExecuteActionRequest;
    const actionName = body?.action;

    if (!actionName || typeof actionName !== 'string') {
      const resp: ExecuteActionResponse = {
        success: false,
        message: 'Missing or invalid "action" field in request body',
      };
      res.json(resp);
      return;
    }

    const idempotencyKey =
      (req.headers['idempotency-key'] as string) ||
      (req.headers['Idempotency-Key'] as string) ||
      (req.headers['x-idempotency-key'] as string) ||
      undefined;

    // Check idempotency cache if key is present
    if (idempotencyStore && idempotencyKey) {
      try {
        const cached = await idempotencyStore.get(idempotencyKey);
        if (cached) {
          res.json(cached);
          return;
        }
      } catch (e) {
        // Ignore store read failures, continue with execution
      }
    }

    const context: ExecutionContext = {
      idempotencyKey,
      headers: req.headers,
      rawRequest: req,
    };

    const response = await executeRegisteredAction(actionName, body.data ?? {}, context);

    // Save to idempotency store if execution succeeded and key provided
    if (idempotencyStore && idempotencyKey && response.success) {
      try {
        await idempotencyStore.set(idempotencyKey, response, options.idempotencyTtlSeconds);
      } catch (e) {
        // Ignore store write failures
      }
    }

    res.json(response);
  });

  return router;
}
