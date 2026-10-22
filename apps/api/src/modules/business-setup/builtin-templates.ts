/**
 * Built-in industry templates shipped with the platform. On startup any that
 * are missing from the database are inserted as platform templates; after
 * that they are ordinary data a platform admin can edit, and businesses copy
 * and customise them. Nothing here is written into a tenant until the owner
 * applies a template.
 */
import { BusinessType } from '@prisma/client';
import { BUSINESS_TEMPLATES } from '../ai-employee/ai-employee-templates';
import type { TemplateDefinition, TemplateEmployeeDef, TemplateRuleDef, TemplateScheduleDef } from './template-definition';

export const BUILTIN_TEMPLATE_VERSION = 1;

const BUSINESS_TYPE: Record<string, BusinessType> = {
  SALON_SPA: 'SALON',
  CLINIC_MEDICAL: 'CLINIC',
  PHARMACY: 'CLINIC',
  HOTEL: 'HOTEL',
  VEHICLE_SERVICE: 'VEHICLE_SERVICE',
  REAL_ESTATE: 'CRM',
  WHOLESALE_DISTRIBUTION: 'ERP',
  PHONE_SHOP: 'ECOMMERCE',
  ECOMMERCE_RETAIL: 'ECOMMERCE',
  GROCERY_SUPERMARKET: 'ECOMMERCE',
  CLOTHING_SHOP: 'ECOMMERCE',
  HARDWARE_SHOP: 'ECOMMERCE',
  GENERAL_RETAIL: 'ECOMMERCE',
};

/** Read-only analyst every template gets unless it already has one. */
const ANALYST: TemplateEmployeeDef = {
  key: 'analyst',
  name: 'AI Business Analyst',
  role: 'Business Analyst',
  department: 'Operations',
  businessFunction: 'Monitoring, reporting & insights',
  description: 'Watches business activity, prepares weekly reviews and flags what needs the owner.',
  actionLevel: 'APPROVAL_REQUIRED',
  responsibilities: [
    'Review weekly performance: conversations, bookings, cancellations, leads and AI work',
    'Spot unusual drops or spikes and explain likely causes from the data',
    'Recommend concrete next steps to the owner',
  ],
  permissions: { viewCustomers: true },
  systemPrompt:
    'You are the business analyst. Base every statement on data from your tools; say clearly when data is missing. Keep reports short and actionable.',
  toolGrants: ['tasks.read', 'activity.read', 'knowledge.search', 'metrics.read', 'customers.read', 'integration:read', 'owner.notify'],
};

/** Industry-specific recurring work and event rules (employeeKey refers to the template's roles). */
const EXTRAS: Record<string, { schedules?: TemplateScheduleDef[]; rules?: TemplateRuleDef[] }> = {
  SALON_SPA: {
    rules: [
      {
        name: 'Offer a new slot after a cancellation',
        triggerEvent: 'appointment.cancelled',
        employeeKey: 'receptionist',
        taskTitle: 'Offer {{customerName}} a new time for their {{service}}',
        taskDescription:
          'A client cancelled. Check availability and prepare a friendly message offering two alternative times. Sending it needs owner approval.',
        dedupeKey: '{{customerId}}',
        cooldownSeconds: 86400,
        priority: 'HIGH',
      },
      {
        name: 'Thank-you and review request after a visit',
        triggerEvent: 'appointment.completed',
        employeeKey: 'marketing',
        taskTitle: 'Thank {{customerName}} and ask for a review',
        taskDescription: 'Draft a short thank-you that mentions their {{service}} and asks for a review. Sending it needs owner approval.',
        dedupeKey: '{{customerId}}',
        cooldownSeconds: 7 * 86400,
      },
    ],
    schedules: [
      {
        employeeKey: 'receptionist',
        title: "Review tomorrow's bookings",
        description: 'List tomorrow’s appointments, flag gaps that could be filled and clients who have not confirmed.',
        cron: '0 17 * * 1-6',
      },
    ],
  },
  CLINIC_MEDICAL: {
    rules: [
      {
        name: 'Reschedule cancelled appointments',
        triggerEvent: 'appointment.cancelled',
        employeeKey: 'appointment',
        taskTitle: 'Help {{customerName}} reschedule',
        taskDescription: 'A patient cancelled. Find the next available slots and draft a message offering them. Do not include medical details.',
        dedupeKey: '{{customerId}}',
        cooldownSeconds: 86400,
        priority: 'HIGH',
      },
    ],
  },
  RESTAURANT_CAFE: {
    schedules: [
      {
        employeeKey: 'reservation',
        title: "Prepare tonight's reservation summary",
        description: 'Summarise tonight’s reservations, large parties and special requests for the team.',
        cron: '0 15 * * *',
      },
    ],
  },
  VEHICLE_SERVICE: {
    rules: [
      {
        name: 'Follow up after a completed service',
        triggerEvent: 'appointment.completed',
        employeeKey: 'service',
        taskTitle: 'Follow up with {{customerName}} after their service',
        taskDescription: 'Draft a follow-up confirming the work done and the next recommended service date. Sending it needs owner approval.',
        dedupeKey: '{{customerId}}',
        cooldownSeconds: 7 * 86400,
      },
    ],
  },
};

function salesKey(employees: TemplateEmployeeDef[]) {
  return employees.find((e) => e.department === 'Sales')?.key;
}
function supportKey(employees: TemplateEmployeeDef[]) {
  return employees.find((e) => e.department === 'Customer Support')?.key ?? employees[0]?.key;
}

export interface BuiltInTemplate {
  key: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  businessType: BusinessType;
  definition: TemplateDefinition;
}

export function builtInTemplates(): BuiltInTemplate[] {
  // The legacy catalog has alias entries (e.g. HOTEL and HOTEL_HOSPITALITY) for the same template.
  const unique = [...new Map(Object.values(BUSINESS_TEMPLATES).map((t) => [t.id, t])).values()];
  return unique.map((t) => {
    const employees: TemplateEmployeeDef[] = t.suggestedEmployees.map((e) => ({
      key: e.key,
      name: e.name,
      role: e.role,
      department: e.department,
      businessFunction: e.businessFunction,
      description: e.description,
      actionLevel: e.actionLevel,
      responsibilities: e.responsibilities,
      permissions: e.permissions,
      systemPrompt: e.systemPrompt,
    }));
    const hasAnalyst = employees.some((e) => e.department === 'Finance' || /analyst/i.test(e.role));
    if (!hasAnalyst) employees.push(ANALYST);
    const analystKey = hasAnalyst ? employees.find((e) => e.department === 'Finance' || /analyst/i.test(e.role))!.key : ANALYST.key;

    const extras = EXTRAS[t.id] ?? {};
    const schedules: TemplateScheduleDef[] = [
      {
        employeeKey: analystKey,
        title: 'Weekly business review',
        description: 'Compare this week with last week (conversations, bookings, cancellations, leads, AI work). Explain changes and recommend 3 actions.',
        cron: '0 9 * * 1',
      },
      {
        employeeKey: supportKey(employees)!,
        title: 'Daily customer follow-up check',
        description: 'Review yesterday’s unresolved conversations and human handoffs. List customers still waiting for an answer and what each needs.',
        cron: '30 8 * * *',
      },
      ...(extras.schedules ?? []),
    ];

    const rules: TemplateRuleDef[] = [
      {
        name: 'Tell the owner when a customer asks for a person',
        triggerEvent: 'human_handoff.requested',
        actionType: 'NOTIFY_OWNER',
        taskTitle: 'A customer is waiting for a person',
        taskDescription: 'Reason: {{reason}}. Open the conversation to reply.',
        dedupeKey: '{{conversationId}}',
        cooldownSeconds: 3600,
      },
      ...(salesKey(employees)
        ? [
            {
              name: 'Follow up new leads',
              triggerEvent: 'lead.created',
              employeeKey: salesKey(employees),
              taskTitle: 'Follow up the new lead {{name}}',
              taskDescription: 'Look up what they asked about and draft a helpful first reply with a clear next step. Sending it needs owner approval.',
              dedupeKey: '{{customerId}}',
              cooldownSeconds: 86400,
              priority: 'HIGH',
            } satisfies TemplateRuleDef,
          ]
        : []),
      ...(extras.rules ?? []),
    ];

    return {
      key: t.id,
      name: t.name,
      category: t.category,
      icon: t.icon,
      description: t.description,
      businessType: BUSINESS_TYPE[t.id] ?? 'CUSTOM',
      definition: { departments: [...new Set(employees.map((e) => e.department))], employees, schedules, rules },
    };
  });
}
