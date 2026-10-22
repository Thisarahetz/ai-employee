import {
  Body,
  Controller,
  DynamicModule,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Module,
  Optional,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
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
  IdempotencyStore,
  ListActionsResponse,
  ListKnowledgeResponse,
  NestAdapterOptions,
} from './types';

export const AI_ACTIONS_OPTIONS = 'AI_ACTIONS_OPTIONS';

/**
 * NestJS controller exposing the Integration API Contract routes under the `/ai` prefix:
 * - GET  /ai/actions
 * - GET  /ai/knowledge
 * - POST /ai/execute
 */
@Controller('ai')
export class AiActionsController {
  private readonly idempotencyStore?: IdempotencyStore;

  constructor(
    @Optional()
    @Inject(AI_ACTIONS_OPTIONS)
    private readonly options?: NestAdapterOptions,
  ) {
    if (options?.idempotencyStore) {
      this.idempotencyStore = options.idempotencyStore;
    } else {
      this.idempotencyStore = new MemoryIdempotencyStore({
        defaultTtlSeconds: options?.idempotencyTtlSeconds,
      });
    }
  }

  private async assertAuthorized(req: any): Promise<void> {
    // Always checked: with no options, checkAuth falls back to AI_EMPLOYEE_API_KEY.
    const isAuthorized = await checkAuth(this.options, req);
    if (!isAuthorized) {
      throw new UnauthorizedException('Unauthorized integration request');
    }
  }

  @Get('actions')
  async listActions(@Req() req: any): Promise<ListActionsResponse> {
    await this.assertAuthorized(req);
    return listRegisteredActionsResponse();
  }

  @Get('knowledge')
  async listKnowledge(@Req() req: any): Promise<ListKnowledgeResponse> {
    await this.assertAuthorized(req);
    return resolveKnowledgeResponse();
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(
    @Body() body: ExecuteActionRequest,
    @Headers() headers: Record<string, string | undefined>,
    @Req() req: any,
  ): Promise<ExecuteActionResponse> {
    await this.assertAuthorized(req);

    const actionName = body?.action;
    if (!actionName || typeof actionName !== 'string') {
      return { success: false, message: 'Missing or invalid "action" field in request body' };
    }

    const idempotencyKey =
      headers?.['idempotency-key'] ||
      headers?.['Idempotency-Key'] ||
      headers?.['x-idempotency-key'] ||
      undefined;

    if (this.idempotencyStore && idempotencyKey) {
      try {
        const cached = await this.idempotencyStore.get(idempotencyKey);
        if (cached) {
          return cached;
        }
      } catch (e) {
        // Ignore store read errors
      }
    }

    const context: ExecutionContext = {
      idempotencyKey,
      headers,
      rawRequest: req,
    };

    const response = await executeRegisteredAction(actionName, body.data ?? {}, context);

    if (this.idempotencyStore && idempotencyKey && response.success) {
      try {
        await this.idempotencyStore.set(idempotencyKey, response, this.options?.idempotencyTtlSeconds);
      } catch (e) {
        // Ignore store write errors
      }
    }

    return response;
  }
}

/**
 * NestJS Module for AI Employee integration.
 *
 * Mount in AppModule:
 * ```ts
 * @Module({
 *   imports: [
 *     AiActionsModule.forRoot({
 *       apiKey: process.env.AI_EMPLOYEE_API_KEY,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  controllers: [AiActionsController],
  providers: [
    {
      provide: AI_ACTIONS_OPTIONS,
      useValue: {},
    },
  ],
})
export class AiActionsModule {
  static forRoot(options: NestAdapterOptions = {}): DynamicModule {
    return {
      module: AiActionsModule,
      controllers: [AiActionsController],
      providers: [
        {
          provide: AI_ACTIONS_OPTIONS,
          useValue: options,
        },
      ],
      exports: [AI_ACTIONS_OPTIONS],
    };
  }
}

// Re-exported so one import is enough in app code.
export { registerAction, registerKnowledge } from './registry';
export { sendEvent } from './events';
