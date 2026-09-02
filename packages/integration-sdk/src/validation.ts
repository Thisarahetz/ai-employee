import type { ActionDefinition, ActionParameter } from './types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates action input data against the action's declared parameters schema.
 * Checks for required parameters and verifies basic data types.
 */
export function validateActionData(
  definition: ActionDefinition,
  data: Record<string, unknown> = {},
): ValidationResult {
  const parameters = definition.parameters ?? {};

  for (const [paramName, schema] of Object.entries(parameters)) {
    const value = data[paramName];

    // Check required fields
    if (schema.required) {
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        return {
          valid: false,
          error: `Missing required parameter "${paramName}" for action "${definition.name}"`,
        };
      }
    }

    // Type checking if value is provided
    if (value !== undefined && value !== null) {
      const typeCheck = validateParamType(paramName, value, schema);
      if (!typeCheck.valid) {
        return typeCheck;
      }
    }
  }

  return { valid: true };
}

function validateParamType(
  paramName: string,
  value: unknown,
  schema: ActionParameter,
): ValidationResult {
  const expectedType = (schema.type || 'string').toLowerCase().trim();

  switch (expectedType) {
    case 'string':
    case 'text':
      if (typeof value !== 'string') {
        return { valid: false, error: `Parameter "${paramName}" must be a string` };
      }
      break;

    case 'number':
    case 'integer':
    case 'int':
    case 'float':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return { valid: false, error: `Parameter "${paramName}" must be a valid number` };
      }
      break;

    case 'boolean':
    case 'bool':
      if (typeof value !== 'boolean') {
        return { valid: false, error: `Parameter "${paramName}" must be a boolean` };
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { valid: false, error: `Parameter "${paramName}" must be an object` };
      }
      break;

    case 'array':
    case 'list':
      if (!Array.isArray(value)) {
        return { valid: false, error: `Parameter "${paramName}" must be an array` };
      }
      break;

    case 'date':
    case 'datetime':
    case 'timestamp':
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return { valid: false, error: `Parameter "${paramName}" must be a valid ISO date or timestamp` };
        }
      } else if (!(value instanceof Date)) {
        return { valid: false, error: `Parameter "${paramName}" must be a valid Date object or ISO string` };
      }
      break;

    default:
      // Custom or unrecognized type hints pass through without failure
      break;
  }

  return { valid: true };
}
