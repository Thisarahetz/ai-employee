import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { getRegisteredAction, getRegisteredActions } from './registry';
import type { ExecuteActionRequest, ExecuteActionResponse, ListActionsResponse } from './types';

/**
 * NestJS equivalent of express-adapter.ts, for consumers whose external system is
 * itself a NestJS app. Exposes the same Integration API Contract routes, always
 * responding HTTP 200 with `{ success, message, data? }` — business failures are
 * signalled via `success: false`, not HTTP status codes.
 *
 * Mount by importing `AiActionsModule` into your app's root module. The controller is
 * fixed at the `ai` path prefix so the final routes are `GET /ai/actions` and
 * `POST /ai/execute`, matching `{baseUrl}/ai/actions` / `{baseUrl}/ai/execute`.
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
