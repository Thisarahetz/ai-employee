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
      let response;
      if (n8nWorkflowId.includes('-')) {
        // It's a webhook path
        const webhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/';
        // Use webhook-test for now since the example workflow is not explicitly activated
        response = await axios.post(
          `${webhookUrl.replace(/\/+$/, '')}/webhook-test/${n8nWorkflowId}`,
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10_000,
          },
        );
      } else {
        // It's a standard ID for the REST API
        response = await axios.post(
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
      }

      // If hitting webhook-test, n8n responds with a success message but not necessarily an executionId
      const executionId = response.data?.executionId ?? response.data?.id ?? response.data?.data?.id ?? `exec-${Date.now()}`;
      return { executionId: typeof executionId === 'string' ? executionId : undefined };
    } catch (error) {
      this.logger.error(
        `Failed to trigger n8n workflow "${n8nWorkflowId}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }
}
