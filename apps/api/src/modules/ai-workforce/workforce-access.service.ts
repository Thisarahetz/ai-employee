import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { OwnerAuthorityService } from '../../common/authz/owner-authority.service';
import { WorkforceToolExecutorService } from './workforce-tool-executor.service';
import { INTEGRATION_READ_GRANT, effectiveGrants, evaluateToolPolicy } from './workforce-tools';

/**
 * Owner-managed tool access for AI employees. Shows each tool with its risk
 * and what would happen if the employee called it, and lets an owner/admin
 * replace the grant list. Restricted tools can't be granted at all.
 */
@Injectable()
export class WorkforceAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: OwnerAuthorityService,
    private readonly audit: AuditLogService,
    private readonly tools: WorkforceToolExecutorService,
  ) {}

  async getToolAccess(tenantId: string, employeeId: string) {
    const employee = await this.prisma.aiEmployee.findFirst({ where: { id: employeeId, tenantId } });
    if (!employee) throw new NotFoundException('AI employee not found');
    const toolset = await this.tools.loadToolset(tenantId);
    const grants = effectiveGrants(employee);

    return {
      employeeId: employee.id,
      configured: employee.toolAccessConfigured,
      actionLevel: employee.actionLevel,
      grants: [...grants],
      tools: [...toolset.values()].map((t) => {
        const policy = evaluateToolPolicy(employee, t);
        return {
          name: t.name,
          grant: t.grant,
          label: t.label,
          description: t.description,
          risk: t.risk,
          source: t.source,
          requiresPermission: t.requiresPermission ?? null,
          granted: grants.has(t.grant) || (t.source === 'integration' && t.risk === 'READ' && grants.has(INTEGRATION_READ_GRANT)),
          decision: policy.decision,
          reason: policy.reason,
        };
      }),
    };
  }

  async setToolAccess(tenantId: string, userId: string, employeeId: string, grants: unknown) {
    await this.authority.assert(tenantId, userId, 'ai_employees:manage');
    if (!Array.isArray(grants) || grants.some((g) => typeof g !== 'string')) {
      throw new BadRequestException('grants must be an array of strings');
    }
    const employee = await this.prisma.aiEmployee.findFirst({ where: { id: employeeId, tenantId } });
    if (!employee) throw new NotFoundException('AI employee not found');

    const toolset = await this.tools.loadToolset(tenantId);
    const grantable = new Set<string>([INTEGRATION_READ_GRANT]);
    const restricted = new Set<string>();
    for (const t of toolset.values()) (t.risk === 'RESTRICTED' ? restricted : grantable).add(t.grant);

    const requested = [...new Set(grants as string[])];
    const bad = requested.filter((g) => restricted.has(g));
    if (bad.length) throw new BadRequestException(`These tools are restricted and cannot be granted: ${bad.join(', ')}`);
    const unknown = requested.filter((g) => !grantable.has(g));
    if (unknown.length) throw new BadRequestException(`Unknown tool grants: ${unknown.join(', ')}`);

    const before = [...effectiveGrants(employee)];
    await this.prisma.aiEmployee.update({
      where: { id: employee.id },
      data: { connectedTools: requested, toolAccessConfigured: true },
    });
    await this.audit.record(tenantId, userId, 'ai_employee.tool_access_updated', 'AiEmployee', employee.id, {
      before,
      after: requested,
    });
    return this.getToolAccess(tenantId, employee.id);
  }
}
