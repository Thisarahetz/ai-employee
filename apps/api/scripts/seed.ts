/**
 * Seeds known dev accounts so a fresh clone has something to log in with
 * immediately, without hand-rolling curl calls:
 *
 *   - A pure platform super admin (`platform@davinlabs.com`) — no tenant, no
 *     membership. Logs straight into the standalone /admin console.
 *   - A platform super admin who also owns a tenant (`admin@davinlabs.com`,
 *     "DavinLabs") — exercises the workspace ⇄ console cross-over.
 *   - A salon tenant OWNER (`owner@acme.test`), with 2 store branches, 3 human team members,
 *     2 deployed AI employees, 1 pending approval, and realistic audit records.
 *
 * Idempotent — safe to re-run (`pnpm prisma:seed`).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;
const DEV_PASSWORD = 'ChangeMe123!';

const prisma = new PrismaClient();

/** A platform admin with no tenant of their own — lives entirely in /admin. */
async function seedPlatformAdmin(params: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  return prisma.user.upsert({
    where: { email: params.email },
    update: { passwordHash, platformRole: 'SUPER_ADMIN', status: 'ACTIVE' },
    create: {
      email: params.email,
      passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      platformRole: 'SUPER_ADMIN',
    },
  });
}

async function seedTenantWithOwner(params: {
  tenantName: string;
  slug: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  platformRole: 'NONE' | 'SUPER_ADMIN';
  timezone?: string;
  locations?: string[];
}) {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  const timezone = params.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Colombo';

  const user = await prisma.user.upsert({
    where: { email: params.ownerEmail },
    update: { passwordHash, platformRole: params.platformRole, phone: '+1 555-0100' },
    create: {
      email: params.ownerEmail,
      passwordHash,
      firstName: params.ownerFirstName,
      lastName: params.ownerLastName,
      platformRole: params.platformRole,
      phone: '+1 555-0100',
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: params.slug },
    update: {},
    create: { name: params.tenantName, slug: params.slug },
  });

  const createdBusinesses: any[] = [];
  for (const locationName of params.locations ?? [params.tenantName]) {
    let biz = await prisma.business.findFirst({
      where: { tenantId: tenant.id, name: locationName },
    });
    if (!biz) {
      biz = await prisma.business.create({
        data: { tenantId: tenant.id, name: locationName, timezone, type: 'SALON' },
      });
    } else if (biz.timezone === 'UTC' || !biz.timezone) {
      biz = await prisma.business.update({
        where: { id: biz.id },
        data: { timezone },
      });
    }
    createdBusinesses.push(biz);
  }

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: {
      role: 'OWNER',
      status: 'ACTIVE',
      jobTitle: 'Business Owner',
      businessRole: 'OWNER',
      accessLevel: 'FULL',
      permissions: ['*'],
      allLocations: true,
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'OWNER',
      status: 'ACTIVE',
      jobTitle: 'Business Owner',
      businessRole: 'OWNER',
      accessLevel: 'FULL',
      permissions: ['*'],
      allLocations: true,
    },
  });

  // Seed initial demo data for Acme Salon
  if (params.slug === 'acme-salon') {
    const downtown = createdBusinesses.find((b) => b.name.includes('Downtown')) || createdBusinesses[0];
    const airport = createdBusinesses.find((b) => b.name.includes('Airport')) || createdBusinesses[1] || createdBusinesses[0];

    // 1. Seed Human Team Members
    const staffAccounts = [
      {
        email: 'manager@acme.test',
        firstName: 'Kasun',
        lastName: 'Perera',
        phone: '+1 555-0101',
        role: 'MANAGER' as const,
        businessRole: 'MANAGER',
        jobTitle: 'Store Manager',
        accessLevel: 'MANAGER',
        allLocations: false,
        locationIds: [downtown.id],
      },
      {
        email: 'cashier@acme.test',
        firstName: 'Nimal',
        lastName: 'Silva',
        phone: '+1 555-0102',
        role: 'EMPLOYEE' as const,
        businessRole: 'CASHIER',
        jobTitle: 'Cashier',
        accessLevel: 'LIMITED',
        allLocations: false,
        locationIds: [downtown.id],
      },
      {
        email: 'stylist@acme.test',
        firstName: 'Samantha',
        lastName: 'Fernando',
        phone: '+1 555-0103',
        role: 'EMPLOYEE' as const,
        businessRole: 'STYLIST',
        jobTitle: 'Lead Hair Stylist',
        accessLevel: 'STANDARD',
        allLocations: false,
        locationIds: [airport.id],
      },
    ];

    for (const staff of staffAccounts) {
      const staffUser = await prisma.user.upsert({
        where: { email: staff.email },
        update: { passwordHash, phone: staff.phone },
        create: {
          email: staff.email,
          passwordHash,
          firstName: staff.firstName,
          lastName: staff.lastName,
          phone: staff.phone,
        },
      });

      await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: staffUser.id } },
        update: {
          role: staff.role,
          status: 'ACTIVE',
          jobTitle: staff.jobTitle,
          businessRole: staff.businessRole,
          accessLevel: staff.accessLevel,
          allLocations: staff.allLocations,
          locationIds: staff.locationIds,
        },
        create: {
          tenantId: tenant.id,
          userId: staffUser.id,
          role: staff.role,
          status: 'ACTIVE',
          jobTitle: staff.jobTitle,
          businessRole: staff.businessRole,
          accessLevel: staff.accessLevel,
          allLocations: staff.allLocations,
          locationIds: staff.locationIds,
        },
      });
    }

    // 2. Seed AI Employees
    const existingEmployee = await prisma.aiEmployee.findFirst({
      where: { tenantId: tenant.id },
    });

    let receptionist = existingEmployee;
    if (!existingEmployee) {
      receptionist = await prisma.aiEmployee.create({
        data: {
          tenantId: tenant.id,
          name: 'AI Front-Desk Receptionist',
          role: 'Receptionist & Booking Assistant',
          department: 'Customer Support',
          businessFunction: 'Appointments & Inquiries',
          description: 'Handles customer inquiries via WhatsApp/Web, checks stylist availability, and books appointments.',
          actionLevel: 'AUTOMATIC',
          scope: 'ALL_BRANCHES',
          responsibilities: [
            'Greet clients and provide treatment menus & pricing',
            'Check real-time stylist availability and book calendar slots',
            'Send booking confirmations and SMS/WhatsApp reminders',
            'Answer questions regarding hair care and spa treatments',
          ],
          assignedTasks: [
            { category: 'CUSTOMER', task: 'Answer treatment inquiries', isEnabled: true },
            { category: 'SALES', task: 'Book appointments & confirm calendar', isEnabled: true },
            { category: 'CUSTOMER', task: 'Send appointment reminders', isEnabled: true },
          ],
          permissions: {
            viewProducts: true,
            viewPrices: true,
            checkStock: true,
            createQuotations: true,
            createOrders: true,
            viewCustomers: true,
            editPrices: false,
            deleteProducts: false,
            refundMoney: false,
            viewProfit: false,
          },
          systemPrompt: 'You are the AI Front-Desk Receptionist for Acme Salon. Maintain a warm, welcoming tone and effortlessly manage bookings.',
          status: 'ACTIVE',
          stats: {
            conversations: 248,
            ordersAssisted: 67,
            tasksCompleted: 189,
            leadsGenerated: 32,
            escalations: 8,
            successRate: 94,
          },
        },
      });

      const inventoryAgent = await prisma.aiEmployee.create({
        data: {
          tenantId: tenant.id,
          name: 'AI Inventory Specialist',
          role: 'Inventory Controller',
          department: 'Inventory',
          businessFunction: 'Styling Products & Restock',
          description: 'Monitors salon shampoo, dye stocks, and flags low levels for reordering.',
          actionLevel: 'APPROVAL_REQUIRED',
          scope: 'ALL_BRANCHES',
          responsibilities: [
            'Monitor shampoo and color inventory levels',
            'Flag low stock before busy weekends',
            'Draft supplier purchase orders for owner approval',
          ],
          assignedTasks: [
            { category: 'INVENTORY', task: 'Monitor stock levels', isEnabled: true },
            { category: 'INVENTORY', task: 'Detect low stock on styling products', isEnabled: true },
            { category: 'OPERATIONS', task: 'Draft supplier reorder (requires approval)', isEnabled: true },
          ],
          permissions: {
            viewProducts: true,
            viewPrices: true,
            checkStock: true,
            createQuotations: false,
            createOrders: false,
            viewCustomers: false,
            editPrices: false,
            deleteProducts: false,
            refundMoney: false,
            viewProfit: false,
          },
          systemPrompt: 'You are the AI Inventory Specialist for Acme Salon.',
          status: 'ACTIVE',
          stats: {
            conversations: 42,
            ordersAssisted: 12,
            tasksCompleted: 88,
            escalations: 0,
            successRate: 99,
          },
        },
      });

      await prisma.aiEmployeeApproval.create({
        data: {
          tenantId: tenant.id,
          employeeId: inventoryAgent.id,
          title: "L'Oréal Color Batch Reorder ($420.00)",
          description: 'Color tubes reached 3 units remaining. Prepared purchase order for 24 tubes.',
          actionType: 'PURCHASE_ORDER',
          actionPayload: { brand: "L'Oréal", quantity: 24, totalUsd: 420.0 },
          status: 'PENDING',
        },
      });

      await prisma.aiEmployeeActivity.createMany({
        data: [
          {
            tenantId: tenant.id,
            employeeId: receptionist.id,
            action: 'Booked Hair Styling Appointment',
            category: 'SALES',
            details: 'Confirmed appointment for Sarah M. on Saturday at 2:00 PM.',
            status: 'SUCCESS',
          },
          {
            tenantId: tenant.id,
            employeeId: inventoryAgent.id,
            action: "Detected Low Stock: L'Oréal Color Tubes",
            category: 'INVENTORY',
            details: 'Stock dropped below 5 units. Generated approval request for reorder.',
            status: 'PENDING_APPROVAL',
          },
        ],
      });
    }

    // 3. Seed Website Chat Channel & Sample Customer Conversation
    let channel = await prisma.channel.findFirst({
      where: { tenantId: tenant.id, type: 'WEBSITE_CHAT' },
    });
    if (!channel) {
      channel = await prisma.channel.create({
        data: {
          tenantId: tenant.id,
          businessId: downtown.id,
          name: 'Website Live Chat',
          type: 'WEBSITE_CHAT',
          status: 'ACTIVE',
        },
      });
    }

    let customer = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, email: 'sarah.m@example.com' },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name: 'Sarah Mitchell',
          email: 'sarah.m@example.com',
          phone: '+1 555-0144',
        },
      });
    }

    const existingConv = await prisma.conversation.findFirst({
      where: { tenantId: tenant.id, customerId: customer.id },
    });
    if (!existingConv && channel) {
      const conv = await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          businessId: downtown.id,
          channelId: channel.id,
          customerId: customer.id,
          status: 'AI_HANDLING',
          currentAgent: 'SUPPORT',
        },
      });

      await prisma.message.createMany({
        data: [
          {
            tenantId: tenant.id,
            conversationId: conv.id,
            sender: 'CUSTOMER',
            content: 'Hi! Do you have any openings for a haircut and blow-dry this Saturday afternoon?',
          },
          {
            tenantId: tenant.id,
            conversationId: conv.id,
            sender: 'AI',
            agentType: 'SUPPORT',
            content: 'Hello Sarah! We would love to take care of your hair. We have an opening with Samantha at 2:00 PM this Saturday at our Downtown branch. Would you like me to reserve that slot for you?',
          },
        ],
      });
    }

    // 4. Seed Human-Readable Audit Logs
    await prisma.auditLog.createMany({
      data: [
        {
          tenantId: tenant.id,
          userId: user.id,
          action: 'TEAM_MEMBER_INVITED',
          entityType: 'TenantMembership',
          entityId: 'seed-manager',
          changes: { summary: 'Ada Owner added Kasun Perera as Store Manager (Acme Salon — Downtown).' },
        },
        {
          tenantId: tenant.id,
          userId: user.id,
          action: 'TEAM_MEMBER_INVITED',
          entityType: 'TenantMembership',
          entityId: 'seed-cashier',
          changes: { summary: 'Ada Owner added Nimal Silva as Cashier (Acme Salon — Downtown).' },
        },
        {
          tenantId: tenant.id,
          userId: user.id,
          action: 'AI_EMPLOYEE_DEPLOYED',
          entityType: 'AiEmployee',
          entityId: receptionist?.id || 'seed-receptionist',
          changes: { summary: 'Ada Owner activated AI Front-Desk Receptionist for all branches.' },
        },
      ],
    });
  }

  return { user, tenant };
}

async function main() {
  console.log('🌱 ========================================================');
  console.log('🌱 SEEDING PRISTINE PRODUCTION-READY DEMO ACCOUNTS');
  console.log('🌱 ========================================================\n');

  await seedPlatformAdmin({
    email: 'platform@davinlabs.com',
    firstName: 'Platform',
    lastName: 'Owner',
  });
  console.log(`  ✔ Pure Super Admin: platform@davinlabs.com / ${DEV_PASSWORD}`);

  await seedTenantWithOwner({
    tenantName: 'DavinLabs',
    slug: 'davinlabs',
    ownerEmail: 'admin@davinlabs.com',
    ownerFirstName: 'Platform',
    ownerLastName: 'Admin',
    platformRole: 'SUPER_ADMIN',
  });
  console.log(`  ✔ Super Admin + Workspace: admin@davinlabs.com / ${DEV_PASSWORD}`);

  await seedTenantWithOwner({
    tenantName: 'Acme Salon & Spa',
    slug: 'acme-salon',
    ownerEmail: 'owner@acme.test',
    ownerFirstName: 'Ada',
    ownerLastName: 'Owner',
    platformRole: 'NONE',
    locations: ['Acme Salon — Downtown', 'Acme Salon — Airport'],
  });
  console.log(`  ✔ Business Owner: owner@acme.test / ${DEV_PASSWORD}`);
  console.log(`     ├── Store Manager: manager@acme.test / ${DEV_PASSWORD}`);
  console.log(`     ├── Store Cashier: cashier@acme.test / ${DEV_PASSWORD}`);
  console.log(`     └── Lead Stylist: stylist@acme.test / ${DEV_PASSWORD}`);
  console.log(`     ├── 2 Branches: Downtown & Airport`);
  console.log(`     ├── 2 AI Employees: Receptionist & Inventory Controller`);
  console.log(`     └── 1 Pending Approval & Live Conversation\n`);

  console.log('========================================================');
  console.log('✔ SEEDING COMPLETE');
  console.log('========================================================\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
