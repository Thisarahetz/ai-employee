import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { BusinessType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { WorkforceScheduleService } from '../ai-workforce/workforce-schedule.service';
import { AutomationRuleService } from '../ai-workforce/automation-rule.service';
import { TemplateDefinition, TemplateValidationError, validateDefinition } from './template-definition';
import { BUILTIN_TEMPLATE_VERSION, builtInTemplates } from './builtin-templates';

type TemplateRow = Prisma.IndustryTemplateGetPayload<object>;

export interface TemplateInput {
  name?: string;
  category?: string;
  icon?: string;
  description?: string;
  businessType?: string;
  definition?: unknown;
  isPublished?: boolean;
}

export interface ApplyOptions {
  employeeKeys?: string[];
  includeSchedules?: boolean;
  includeRules?: boolean;
  /** Schedules and rules are created switched off unless this is true. */
  enableAutomations?: boolean;
  businessId?: string;
}

export interface BusinessProfile {
  description?: string;
  services?: string;
  hours?: string;
  brandVoice?: string;
  policies?: string;
  departments?: string[];
  goals?: string[];
}

const BUSINESS_TYPES = Object.values(BusinessType) as string[];
const MAX_CUSTOM_TEMPLATES = 20;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'template';

/**
 * Configurable business setup for any industry: a catalog of industry
 * templates (platform ones + each business's own customised copies), applying
 * a template (AI employees, schedules, automation rules), and the business
 * profile every AI employee works from.
 */
@Injectable()
export class BusinessSetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BusinessSetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly schedules: WorkforceScheduleService,
    private readonly rules: AutomationRuleService,
  ) {}

  /** Inserts built-in templates that are missing. Never overwrites admin edits. */
  async onApplicationBootstrap() {
    try {
      const n = await this.syncBuiltIns();
      if (n) this.logger.log(`Installed ${n} built-in industry template(s).`);
    } catch (err) {
      this.logger.error(`Built-in template sync failed: ${(err as Error).message}`);
    }
  }

  async syncBuiltIns(): Promise<number> {
    const res = await this.prisma.industryTemplate.createMany({
      data: builtInTemplates().map((t) => ({
        tenantId: null,
        key: t.key,
        name: t.name,
        category: t.category,
        icon: t.icon,
        description: t.description,
        businessType: t.businessType,
        definition: validateDefinition(t.definition) as unknown as Prisma.InputJsonValue,
        isBuiltIn: true,
        version: BUILTIN_TEMPLATE_VERSION,
      })),
      skipDuplicates: true,
    });
    return res.count;
  }

  // ── Tenant-facing catalog ───────────────────────────────────────────────

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.industryTemplate.findMany({
      where: { OR: [{ tenantId: null, isPublished: true }, { tenantId }] },
      orderBy: [{ tenantId: { sort: 'desc', nulls: 'last' } }, { category: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => summarize(r, tenantId));
  }

  async getForTenant(tenantId: string, id: string) {
    const row = await this.prisma.industryTemplate.findFirst({
      where: { id, OR: [{ tenantId: null, isPublished: true }, { tenantId }] },
    });
    if (!row) throw new NotFoundException('Template not found');
    return { ...summarize(row, tenantId), definition: row.definition };
  }

  /** A business's own template, optionally starting as a copy of another one. */
  async createCustom(tenantId: string, userId: string, input: TemplateInput & { basedOnId?: string }) {
    const count = await this.prisma.industryTemplate.count({ where: { tenantId } });
    if (count >= MAX_CUSTOM_TEMPLATES) throw new BadRequestException(`A business can keep at most ${MAX_CUSTOM_TEMPLATES} custom templates.`);
    let base: TemplateRow | null = null;
    if (input.basedOnId) {
      base = await this.prisma.industryTemplate.findFirst({ where: { id: input.basedOnId, OR: [{ tenantId: null }, { tenantId }] } });
      if (!base) throw new NotFoundException('Template to copy not found');
    }
    const name = input.name?.trim() || (base ? `${base.name} (custom)` : '');
    if (!name) throw new BadRequestException('A template name is required.');
    const definition = this.validate(input.definition ?? base?.definition);
    const key = await this.uniqueKey(tenantId, `custom_${slug(name)}`);
    const row = await this.prisma.industryTemplate.create({
      data: {
        tenantId,
        key,
        name: name.slice(0, 120),
        category: input.category?.slice(0, 60) || base?.category || 'Custom',
        icon: input.icon?.slice(0, 40) || base?.icon || 'Briefcase',
        description: (input.description ?? base?.description ?? '').slice(0, 1000),
        businessType: this.businessType(input.businessType ?? base?.businessType),
        definition: definition as unknown as Prisma.InputJsonValue,
        basedOnKey: base?.key ?? null,
        createdByUserId: userId,
      },
    });
    await this.audit.record(tenantId, userId, 'industry_template.created', 'IndustryTemplate', row.id, { key, basedOn: base?.key });
    return row;
  }

  async updateCustom(tenantId: string, userId: string, id: string, input: TemplateInput) {
    const row = await this.prisma.industryTemplate.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Only your own templates can be edited. Copy a platform template to customise it.');
    const updated = await this.prisma.industryTemplate.update({ where: { id }, data: { ...this.patchData(input), version: { increment: 1 } } });
    await this.audit.record(tenantId, userId, 'industry_template.updated', 'IndustryTemplate', id, { fields: Object.keys(input ?? {}) });
    return updated;
  }

  async deleteCustom(tenantId: string, userId: string, id: string) {
    const row = await this.prisma.industryTemplate.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Template not found');
    await this.prisma.industryTemplate.delete({ where: { id } });
    await this.audit.record(tenantId, userId, 'industry_template.deleted', 'IndustryTemplate', id, { key: row.key });
    return { deleted: true };
  }

  /**
   * Installs a template into the business: AI employees (existing ones with the
   * same role are reused), recurring schedules and automation rules. Nothing
   * fake is created — no sample activity, stats or approvals.
   */
  async apply(tenantId: string, userId: string, id: string, opts: ApplyOptions = {}) {
    const row = await this.prisma.industryTemplate.findFirst({ where: { id, OR: [{ tenantId: null, isPublished: true }, { tenantId }] } });
    if (!row) throw new NotFoundException('Template not found');
    const def = this.validate(row.definition);
    const chosen = opts.employeeKeys?.length ? def.employees.filter((e) => opts.employeeKeys!.includes(e.key)) : def.employees;
    if (!chosen.length) throw new BadRequestException('Choose at least one AI employee from the template.');

    const keyToId = new Map<string, string>();
    const employees: { key: string; id: string; name: string; created: boolean }[] = [];
    for (const e of chosen) {
      const existing = await this.prisma.aiEmployee.findFirst({ where: { tenantId, role: e.role }, select: { id: true, name: true } });
      if (existing) {
        keyToId.set(e.key, existing.id);
        employees.push({ key: e.key, id: existing.id, name: existing.name, created: false });
        continue;
      }
      const created = await this.prisma.aiEmployee.create({
        data: {
          tenantId,
          name: e.name,
          role: e.role,
          department: e.department,
          businessFunction: e.businessFunction,
          description: e.description,
          actionLevel: e.actionLevel,
          responsibilities: e.responsibilities as Prisma.InputJsonValue,
          permissions: e.permissions as Prisma.InputJsonValue,
          systemPrompt: e.systemPrompt,
          ...(e.toolGrants ? { connectedTools: e.toolGrants, toolAccessConfigured: true } : {}),
        },
      });
      await this.prisma.aiEmployeeActivity.create({
        data: { tenantId, employeeId: created.id, action: `Hired from the "${row.name}" template`, category: 'OPERATIONS', details: e.role, status: 'SUCCESS' },
      });
      keyToId.set(e.key, created.id);
      employees.push({ key: e.key, id: created.id, name: created.name, created: true });
    }

    const enabled = opts.enableAutomations === true;
    const problems: string[] = [];
    let schedulesCreated = 0;
    let rulesCreated = 0;

    if (opts.includeSchedules !== false) {
      for (const s of def.schedules) {
        const employeeId = keyToId.get(s.employeeKey);
        if (!employeeId) continue;
        const dup = await this.prisma.aiTaskSchedule.findFirst({ where: { tenantId, employeeId, title: s.title }, select: { id: true } });
        if (dup) continue;
        try {
          await this.schedules.create(tenantId, userId, { employeeId, title: s.title, description: s.description, cron: s.cron, priority: s.priority, enabled });
          schedulesCreated++;
        } catch (err) {
          problems.push(`Schedule "${s.title}": ${(err as Error).message}`);
        }
      }
    }
    if (opts.includeRules !== false) {
      for (const r of def.rules) {
        const employeeId = r.employeeKey ? keyToId.get(r.employeeKey) : undefined;
        if (r.actionType === 'CREATE_TASK' && !employeeId) continue;
        const dup = await this.prisma.aiAutomationRule.findFirst({ where: { tenantId, name: r.name, triggerEvent: r.triggerEvent }, select: { id: true } });
        if (dup) continue;
        try {
          const { employeeKey: _k, ...rule } = r;
          await this.rules.create(tenantId, userId, { ...rule, employeeId: employeeId ?? null, enabled }, { templateKey: row.key });
          rulesCreated++;
        } catch (err) {
          problems.push(`Rule "${r.name}": ${(err as Error).message}`);
        }
      }
    }

    const business = opts.businessId
      ? await this.prisma.business.findFirst({ where: { id: opts.businessId, tenantId } })
      : await this.prisma.business.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    if (business) {
      const profile = (business.profile ?? {}) as BusinessProfile;
      await this.prisma.business.update({
        where: { id: business.id },
        data: {
          industryTemplateKey: row.key,
          ...(business.type === 'CUSTOM' && row.businessType !== 'CUSTOM' ? { type: row.businessType } : {}),
          profile: { ...profile, departments: profile.departments?.length ? profile.departments : def.departments } as Prisma.InputJsonValue,
        },
      });
    }
    await this.audit.record(tenantId, userId, 'industry_template.applied', 'IndustryTemplate', row.id, {
      key: row.key,
      employeesCreated: employees.filter((e) => e.created).length,
      schedulesCreated,
      rulesCreated,
      automationsEnabled: enabled,
    });
    return { template: row.name, employees, schedulesCreated, rulesCreated, automationsEnabled: enabled, problems };
  }

  // ── Business profile ────────────────────────────────────────────────────

  async getProfile(tenantId: string, businessId?: string) {
    const b = await this.business(tenantId, businessId);
    return { businessId: b.id, name: b.name, type: b.type, timezone: b.timezone, industryTemplateKey: b.industryTemplateKey, profile: (b.profile ?? {}) as BusinessProfile };
  }

  async updateProfile(tenantId: string, userId: string, input: BusinessProfile & { businessId?: string; timezone?: string; type?: string }) {
    const b = await this.business(tenantId, input.businessId);
    const text = (v: unknown, max: number) => (v === undefined ? undefined : String(v ?? '').trim().slice(0, max));
    const list = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 20) : []);
    const current = (b.profile ?? {}) as BusinessProfile;
    const next: BusinessProfile = { ...current };
    const assign = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K] | undefined) => {
      if (v !== undefined) next[k] = v;
    };
    assign('description', text(input.description, 2000));
    assign('services', text(input.services, 4000));
    assign('hours', text(input.hours, 1000));
    assign('brandVoice', text(input.brandVoice, 1000));
    assign('policies', text(input.policies, 4000));
    assign('departments', list(input.departments));
    assign('goals', list(input.goals));

    const data: Prisma.BusinessUpdateInput = { profile: next as Prisma.InputJsonValue };
    if (input.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
      } catch {
        throw new BadRequestException(`Unknown timezone "${input.timezone}".`);
      }
      data.timezone = input.timezone;
    }
    if (input.type !== undefined) data.type = this.businessType(input.type);
    await this.prisma.business.update({ where: { id: b.id }, data });
    await this.audit.record(tenantId, userId, 'business.profile_updated', 'Business', b.id, { fields: Object.keys(input) });
    return this.getProfile(tenantId, b.id);
  }

  // ── Getting started guide ───────────────────────────────────────────────

  /**
   * The steps a new business must complete to run with its AI team. Each
   * step's `done` is worked out from real data (never a box the owner ticks),
   * so the guide always shows where the business really is.
   */
  async gettingStarted(tenantId: string) {
    const b = await this.business(tenantId);
    const profile = (b.profile ?? {}) as BusinessProfile;
    const settings = (b.settings ?? {}) as Record<string, unknown>;
    const [employees, readyDocs, docs, channels, conversations, members, limits, schedules, rules, commands, tasks] = await Promise.all([
      this.prisma.aiEmployee.count({ where: { tenantId } }),
      this.prisma.document.count({ where: { tenantId, status: 'READY' } }),
      this.prisma.document.count({ where: { tenantId } }),
      this.prisma.channel.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.conversation.count({ where: { tenantId } }),
      this.prisma.tenantMembership.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.tenantAiSettings.count({ where: { tenantId } }),
      this.prisma.aiTaskSchedule.count({ where: { tenantId, enabled: true } }),
      this.prisma.aiAutomationRule.count({ where: { tenantId, enabled: true } }),
      this.prisma.ownerCommandMessage.count({ where: { tenantId, role: 'OWNER' } }),
      this.prisma.aiTask.count({ where: { tenantId, createdByUserId: { not: null } } }),
    ]);

    const steps = [
      {
        key: 'team',
        title: 'Set up your AI team',
        why: 'Pick your industry so the right AI employees, recurring work and automations are created for you.',
        href: '/onboarding',
        action: 'Open the setup wizard',
        done: employees > 0,
        detail: employees ? `${employees} AI employee(s)` : null,
      },
      {
        key: 'profile',
        title: 'Describe your business',
        why: 'Every AI employee reads this before each task: what you do, your services, hours and how you talk to customers.',
        href: '/business-setup',
        action: 'Fill in the business profile',
        done: Boolean(profile.description?.trim() && (profile.services?.trim() || profile.hours?.trim())),
        detail: null,
      },
      {
        key: 'knowledge',
        title: 'Add your prices and policies',
        why: 'Customers get answers only from this information, so use your real prices, rules and opening hours.',
        href: '/knowledge-base',
        action: 'Add business information',
        done: readyDocs > 0,
        detail: docs && !readyDocs ? 'Documents are still being processed' : readyDocs ? `${readyDocs} document(s) ready` : null,
      },
      {
        key: 'channel',
        title: 'Connect WhatsApp or website chat',
        why: 'This is how customers reach your AI employees.',
        href: '/channels',
        action: 'Connect a channel',
        done: channels > 0,
        detail: null,
      },
      {
        key: 'test',
        title: 'Send a test message',
        why: 'Message your business like a customer would and check the answer is right before customers do.',
        href: '/channels',
        action: 'Test your channel',
        done: conversations > 0,
        detail: null,
      },
      {
        key: 'limits',
        title: 'Set your AI budget',
        why: 'Choose how much AI work may cost per day and month. Work pauses safely when the limit is reached.',
        href: '/automation',
        action: 'Review AI limits',
        done: limits > 0,
        detail: null,
      },
      {
        key: 'schedule',
        title: 'Switch on recurring work',
        why: 'Run a schedule once to see the result, then turn it on so your AI team works every day without being asked.',
        href: '/automation',
        action: 'Turn on a schedule',
        done: schedules > 0,
        detail: schedules ? `${schedules} running` : null,
      },
      {
        key: 'command',
        title: 'Give your AI team its first task',
        why: 'Ask in plain words, for example "Give me a summary of what the team did today", and learn how reports and approvals come back.',
        href: '/command-center',
        action: 'Open the Command Center',
        done: commands > 0 || tasks > 0,
        detail: null,
      },
      {
        key: 'staff',
        title: 'Invite your staff',
        why: 'Give each person the right role so they can reply to customers or take over chats.',
        href: '/team',
        action: 'Invite a team member',
        done: members > 1,
        optional: true,
        detail: null,
      },
      {
        key: 'automation',
        title: 'Turn on an automation',
        why: 'Let AI employees react to events, such as offering a new time when an appointment is cancelled.',
        href: '/automations',
        action: 'Review automations',
        done: rules > 0,
        optional: true,
        detail: null,
      },
    ].map((st) => ({ optional: false, ...st }));

    const required = steps.filter((st) => !st.optional);
    const doneRequired = required.filter((st) => st.done).length;
    return {
      steps,
      completed: steps.filter((st) => st.done).length,
      total: steps.length,
      requiredCompleted: doneRequired,
      requiredTotal: required.length,
      isComplete: doneRequired === required.length,
      next: steps.find((st) => !st.done && !st.optional) ?? steps.find((st) => !st.done) ?? null,
      dismissed: typeof settings.gettingStartedDismissedAt === 'string',
    };
  }

  async setGettingStartedDismissed(tenantId: string, userId: string, dismissed: boolean) {
    const b = await this.business(tenantId);
    const settings = { ...((b.settings ?? {}) as Record<string, unknown>) };
    if (dismissed) settings.gettingStartedDismissedAt = new Date().toISOString();
    else delete settings.gettingStartedDismissedAt;
    await this.prisma.business.update({ where: { id: b.id }, data: { settings: settings as Prisma.InputJsonValue } });
    await this.audit.record(tenantId, userId, dismissed ? 'getting_started.dismissed' : 'getting_started.reopened', 'Business', b.id, {});
    return this.gettingStarted(tenantId);
  }

  // ── Platform admin ──────────────────────────────────────────────────────

  async adminList() {
    const [rows, adoption] = await Promise.all([
      this.prisma.industryTemplate.findMany({ where: { tenantId: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.prisma.business.groupBy({ by: ['industryTemplateKey'], _count: { _all: true } }),
    ]);
    const used = new Map(adoption.map((a) => [a.industryTemplateKey, a._count._all]));
    return rows.map((r) => ({ ...summarize(r, null), definition: r.definition, adoptionCount: used.get(r.key) ?? 0 }));
  }

  async adminCreate(userId: string, input: TemplateInput & { key?: string }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('A template name is required.');
    const key = (input.key?.trim().toUpperCase() || slug(name).toUpperCase()).replace(/[^A-Z0-9_]/g, '_').slice(0, 40);
    const exists = await this.prisma.industryTemplate.findFirst({ where: { tenantId: null, key } });
    if (exists) throw new ConflictException(`A platform template with key ${key} already exists.`);
    return this.prisma.industryTemplate.create({
      data: {
        tenantId: null,
        key,
        name: name.slice(0, 120),
        category: input.category?.slice(0, 60) || 'General',
        icon: input.icon?.slice(0, 40) || 'Briefcase',
        description: (input.description ?? '').slice(0, 1000),
        businessType: this.businessType(input.businessType),
        definition: this.validate(input.definition) as unknown as Prisma.InputJsonValue,
        isPublished: input.isPublished ?? false,
        createdByUserId: userId,
      },
    });
  }

  async adminUpdate(id: string, input: TemplateInput) {
    const row = await this.prisma.industryTemplate.findFirst({ where: { id, tenantId: null } });
    if (!row) throw new NotFoundException('Platform template not found');
    return this.prisma.industryTemplate.update({ where: { id }, data: { ...this.patchData(input), version: { increment: 1 } } });
  }

  async adminDelete(id: string) {
    const row = await this.prisma.industryTemplate.findFirst({ where: { id, tenantId: null } });
    if (!row) throw new NotFoundException('Platform template not found');
    // Built-ins would be re-inserted on the next start; unpublish them instead.
    if (row.isBuiltIn) {
      await this.prisma.industryTemplate.update({ where: { id }, data: { isPublished: false } });
      return { deleted: false, unpublished: true };
    }
    await this.prisma.industryTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private validate(raw: unknown): TemplateDefinition {
    try {
      return validateDefinition(raw);
    } catch (err) {
      if (err instanceof TemplateValidationError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private patchData(input: TemplateInput): Prisma.IndustryTemplateUpdateInput {
    const data: Prisma.IndustryTemplateUpdateInput = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new BadRequestException('Name cannot be empty.');
      data.name = input.name.trim().slice(0, 120);
    }
    if (input.category !== undefined) data.category = String(input.category).slice(0, 60);
    if (input.icon !== undefined) data.icon = String(input.icon).slice(0, 40);
    if (input.description !== undefined) data.description = String(input.description).slice(0, 1000);
    if (input.businessType !== undefined) data.businessType = this.businessType(input.businessType);
    if (input.definition !== undefined) data.definition = this.validate(input.definition) as unknown as Prisma.InputJsonValue;
    if (input.isPublished !== undefined) data.isPublished = Boolean(input.isPublished);
    return data;
  }

  private businessType(v: unknown): BusinessType {
    if (v === undefined || v === null || v === '') return 'CUSTOM';
    const t = String(v).toUpperCase();
    if (!BUSINESS_TYPES.includes(t)) throw new BadRequestException(`businessType must be one of ${BUSINESS_TYPES.join(', ')}`);
    return t as BusinessType;
  }

  private async uniqueKey(tenantId: string, base: string) {
    for (let i = 0; i < 50; i++) {
      const key = i === 0 ? base : `${base}_${i + 1}`;
      if (!(await this.prisma.industryTemplate.findFirst({ where: { tenantId, key }, select: { id: true } }))) return key;
    }
    throw new ConflictException('Could not pick a unique template key.');
  }

  private async business(tenantId: string, businessId?: string) {
    const b = businessId
      ? await this.prisma.business.findFirst({ where: { id: businessId, tenantId } })
      : await this.prisma.business.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    if (!b) throw new NotFoundException('Business not found');
    return b;
  }
}

function summarize(r: TemplateRow, tenantId: string | null) {
  const d = (r.definition ?? {}) as Partial<TemplateDefinition>;
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    category: r.category,
    icon: r.icon,
    description: r.description,
    businessType: r.businessType,
    isBuiltIn: r.isBuiltIn,
    isPublished: r.isPublished,
    version: r.version,
    basedOnKey: r.basedOnKey,
    owner: r.tenantId === null ? 'platform' : r.tenantId === tenantId ? 'business' : 'other',
    departments: d.departments ?? [],
    employees: (d.employees ?? []).map((e) => ({ key: e.key, name: e.name, role: e.role, department: e.department, description: e.description, actionLevel: e.actionLevel })),
    scheduleCount: d.schedules?.length ?? 0,
    ruleCount: d.rules?.length ?? 0,
  };
}
