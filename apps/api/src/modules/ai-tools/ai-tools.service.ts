import { Injectable } from '@nestjs/common';
import type { AIToolDefinition } from '@ai-employee/ai-core';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bridges IntegrationAction rows (discovered from the tenant's connected
 * external system via the Integration Layer, built by Agent 3) into
 * ai-core's provider-agnostic AIToolDefinition shape. Only ENABLED actions
 * are exposed — the Action Agent should never be offered a tool it can't
 * actually call.
 */
@Injectable()
export class AiToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async getToolsForTenant(tenantId: string): Promise<AIToolDefinition[]> {
    const actions = await this.prisma.integrationAction.findMany({
      where: { tenantId, isEnabled: true },
      select: { name: true, description: true, parameters: true },
    });

    return actions.map((action, idx) => ({
      name: action.name,
      description: action.description,
      parameters: toJsonSchema((action.parameters ?? {}) as Record<string, unknown>),
      // Mark last tool with cacheControl to place cache breakpoint after tool definitions
      cacheControl: idx === actions.length - 1,
    }));
  }
}

/**
 * The Integration API Contract stores an action's parameters as a flat
 * `{ name: { type, description, required } }` map. OpenAI / Anthropic / Gemini
 * function-calling all expect a JSON-Schema object instead
 * (`{ type: 'object', properties: {...}, required: [...] }`) — passing the flat
 * map straight through makes Gemini reject the whole request with
 * `Unknown name "<param>"`. Normalize here, once, for every provider.
 *
 * A `parameters` object that already looks like JSON Schema (has `type` or
 * `properties`) is passed through untouched.
 */
function toJsonSchema(parameters: Record<string, unknown>): Record<string, unknown> {
  if ('type' in parameters || 'properties' in parameters) {
    return parameters;
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, raw] of Object.entries(parameters)) {
    const def = (raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : { type: 'string' }) as Record<
      string,
      unknown
    >;
    if (def.required === true) required.push(name);
    // `required` is a per-field boolean in the contract, but a string[] at the
    // object level in JSON Schema — drop the boolean form from the property.
    delete def.required;
    if (!def.type) def.type = 'string';
    properties[name] = def;
  }

  return required.length > 0
    ? { type: 'object', properties, required }
    : { type: 'object', properties };
}
