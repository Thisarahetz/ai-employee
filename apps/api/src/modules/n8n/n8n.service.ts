import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface TriggerWorkflowPayload {
  tenantId: string;
  businessId?: string;
  customerId?: string;
  conversationId?: string;
  eventType: string;
  data: unknown;
}

export interface TriggerWorkflowResult {
  executionId?: string;
}

/**
 * n8n trigger strategy (pick-one, documented per spec): this service calls n8n's REST
 * API — `POST {N8N_API_URL}/workflows/:id/trigger` with an `X-N8N-API-KEY` header —
 * rather than n8n's webhook-node URLs. Reasoning: the REST API lets `Workflow.n8nWorkflowId`
 * (the id n8n assigns the workflow) be the only thing we need to store; a webhook-based
 * approach would additionally require provisioning + recording a per-workflow webhook
 * path/URL on every Workflow row. If your n8n workflows are built around Webhook trigger
 * nodes instead, swap the URL below for `${N8N_WEBHOOK_URL}webhook/<path>` and drop the
 * API-key header in favor of whatever auth the webhook node itself is configured with.
 *
 * Per the "n8n failures must not break core AI Employee flow" principle: every call is
 * wrapped in try/catch, logs on failure, and resolves to `{}` rather than throwing.
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);

  async triggerWorkflow(n8nWorkflowId: string, payload: TriggerWorkflowPayload): Promise<TriggerWorkflowResult> {
    const baseUrl = process.env.N8N_API_URL;
    if (!baseUrl) {
      this.logger.warn('N8N_API_URL is not configured; skipping n8n workflow trigger');
      return {};
    }

    try {
      const response = await axios.post(
        `${baseUrl.replace(/\/+$/, '')}/workflows/${n8nWorkflowId}/trigger`,
        payload,
        {
          headers: {
            'X-N8N-API-KEY': process.env.N8N_API_KEY ?? '',
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      const executionId = response.data?.executionId ?? response.data?.id ?? response.data?.data?.id;
      return { executionId: typeof executionId === 'string' ? executionId : undefined };
    } catch (error) {
      this.logger.error(
        `Failed to trigger n8n workflow "${n8nWorkflowId}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }
}
