import { Injectable, Logger } from '@nestjs/common';
import type { AIMessage } from '@ai-employee/ai-core';

const MAX_TOOL_OUTPUT_CHARS = 1200; // ~300 tokens max per tool execution
const MAX_ARRAY_ITEMS = 6;

/**
 * ToolOutputCompressorService (RTK & Context-Mode Pattern)
 *
 * Implements semantic compression and noise filtering for tool call results.
 * Strips redundant database columns, empty/null values, internal metadata, and
 * deeply nested structures before they enter the active LLM context.
 *
 * Typical token savings: 60-90% reduction on tool call feedback loops.
 */
@Injectable()
export class ToolOutputCompressorService {
  private readonly logger = new Logger(ToolOutputCompressorService.name);

  /**
   * Compresses a raw tool output into a dense, token-efficient summary.
   */
  compressToolResult(toolName: string, raw: unknown): string {
    if (!raw) return '{"success":true,"data":null}';

    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof obj !== 'object' || obj === null) {
        return String(raw).slice(0, MAX_TOOL_OUTPUT_CHARS);
      }

      // If failure/error, return compact error message without stack traces
      if (obj.success === false || obj.error) {
        return JSON.stringify({
          success: false,
          message: obj.message || obj.error || 'Action failed',
        });
      }

      const data = obj.data !== undefined ? obj.data : obj;
      const cleanData = this.sanitizeValue(data);

      const result = JSON.stringify({
        success: true,
        ...(cleanData !== undefined ? { data: cleanData } : {}),
      });

      if (result.length > MAX_TOOL_OUTPUT_CHARS) {
        return result.slice(0, MAX_TOOL_OUTPUT_CHARS) + '...[truncated]';
      }

      return result;
    } catch {
      return String(raw).slice(0, MAX_TOOL_OUTPUT_CHARS);
    }
  }

  /**
   * Compacts older steps in a multi-turn tool execution transcript so earlier
   * intermediate dumps don't bloat subsequent reasoning steps.
   */
  compactTranscript(transcript: AIMessage[]): AIMessage[] {
    if (transcript.length <= 2) return transcript;

    return transcript.map((msg, idx) => {
      // If this is an older user feedback step (not the most recent result step)
      if (msg.role === 'user' && idx < transcript.length - 2 && msg.content.startsWith('Results:\n')) {
        const rawLine = msg.content.split('\n')[1] || msg.content;
        const summary = rawLine.length > 120 ? rawLine.slice(0, 120) + '...' : rawLine;
        return {
          role: 'user',
          content: `[Previous step summary: ${summary}]`,
        };
      }
      return msg;
    });
  }

  private sanitizeValue(val: unknown): unknown {
    if (Array.isArray(val)) {
      const sliced = val.slice(0, MAX_ARRAY_ITEMS).map((item) => this.sanitizeValue(item));
      if (val.length > MAX_ARRAY_ITEMS) {
        sliced.push(`... and ${val.length - MAX_ARRAY_ITEMS} more items` as any);
      }
      return sliced;
    }

    if (val && typeof val === 'object') {
      const cleaned: Record<string, unknown> = {};
      const ignoreKeys = new Set([
        'createdAt',
        'updatedAt',
        'deletedAt',
        'tenantId',
        'password',
        '__v',
        'metadata',
        'rawResponse',
        'stack',
      ]);

      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (ignoreKeys.has(k) || v === null || v === undefined || v === '') {
          continue;
        }
        cleaned[k] = this.sanitizeValue(v);
      }
      return cleaned;
    }

    return val;
  }
}
