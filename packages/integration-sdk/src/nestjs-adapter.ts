import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { getRegisteredAction, getRegisteredActions, resolveKnowledgeResponse } from './registry';
import type {
  ExecuteActionRequest,
  ExecuteActionResponse,
  ListActionsResponse,
  ListKnowledgeResponse,
} from './types';

/**
 * NestJS equivalent of express-adapter.ts, for consumers whose external system is
 * itself a NestJS app. Exposes the same Integration API Contract routes, always
 * responding HTTP 200 with `{ success, message, data? }` — business failures are
 * signalled via `success: false`, not HTTP status codes.
 *
 * Mount by importing `AiActionsModule` into your app's root module. The controller is
 * fixed at the `ai` path prefix so the final routes are `GET /ai/actions`,
 * `POST /ai/execute` and `GET /ai/knowledge`, matching the `{baseUrl}/ai/*` contract.
 */
@Controller('ai')
export class AiActionsController {
  @Get('actions')
  listActions(): ListActionsResponse {
    return {
      actions: getRegisteredActions().map(({ name, description, parameters }) => ({
        name,
        description,
        parameters,
      })),
    };
  }

  @Get('knowledge')
  listKnowledge(): Promise<ListKnowledgeResponse> {
    return resolveKnowledgeResponse();
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(@Body() body: ExecuteActionRequest): Promise<ExecuteActionResponse> {
    const definition = body?.action ? getRegisteredAction(body.action) : undefined;

    if (!definition) {
      return { success: false, message: `Unknown action "${String(body?.action)}"` };
    }

    try {
      const result = await definition.handler(body.data ?? {});
      return { success: true, message: `${body.action} executed successfully`, data: result };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}

@Module({
  controllers: [AiActionsController],
})
export class AiActionsModule {}
