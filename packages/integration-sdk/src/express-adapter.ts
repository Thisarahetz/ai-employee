import { Router } from 'express';
import type { Request, Response } from 'express';
import { getRegisteredAction, getRegisteredActions, resolveKnowledgeResponse } from './registry';
import type { ExecuteActionResponse, ListActionsResponse } from './types';

/**
 * Creates an Express router exposing the Integration API Contract endpoints off
 * whatever base path you mount it at. Since the contract is `{baseUrl}/ai/actions`,
 * `{baseUrl}/ai/execute` and `{baseUrl}/ai/knowledge`, mount this at `/ai`:
 *
 *   app.use('/ai', createExpressRouter());
 *
 * Both routes always resolve with HTTP 200 — success/failure is communicated via the
 * `success` flag in the JSON body, per the contract's response shape, so a well-behaved
 * AI Employee client never has to special-case HTTP status codes for business failures.
 */
export function createExpressRouter(): Router {
  const router = Router();

  router.get('/actions', (_req: Request, res: Response) => {
    try {
      const body: ListActionsResponse = {
        actions: getRegisteredActions().map(({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        })),
      };
      res.json(body);
    } catch (error) {
      res.status(500).json({ actions: [], error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/knowledge', async (_req: Request, res: Response) => {
    try {
      res.json(await resolveKnowledgeResponse());
    } catch (error) {
      res.json({ documents: [], locations: [] });
    }
  });

  router.post('/execute', async (req: Request, res: Response) => {
    const { action, data } = (req.body ?? {}) as { action?: string; data?: Record<string, unknown> };
    const definition = typeof action === 'string' ? getRegisteredAction(action) : undefined;

    if (!definition) {
      const body: ExecuteActionResponse = { success: false, message: `Unknown action "${String(action)}"` };
      res.json(body);
      return;
    }

    try {
      const result = await definition.handler(data ?? {});
      const body: ExecuteActionResponse = {
        success: true,
        message: `${action} executed successfully`,
        data: result,
      };
      res.json(body);
    } catch (error) {
      const body: ExecuteActionResponse = {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
      res.json(body);
    }
  });

  return router;
}
