import { TenantRole } from '@prisma/client';

export interface PermissionDefinition {
  id: string;
  name: string;
  description: string;
}

export interface PermissionCategory {
  id: string;
  name: string;
  description: string;
  permissions: PermissionDefinition[];
}

export interface BusinessRoleTemplate {
  key: string;
  name: string;
  baseRole: TenantRole;
  accessLevel: 'FULL' | 'MANAGER' | 'STANDARD' | 'LIMITED' | 'CUSTOM';
  description: string;
  defaultPermissions: string[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'sales',
    name: 'Sales',
    description: 'Orders, sales transactions, and customer checkouts',
    permissions: [
      { id: 'sales:view', name: 'View Sales', description: 'Browse transaction history and sales list' },
      { id: 'sales:create', name: 'Create Sale', description: 'Process new sales, orders, and checkouts' },
      { id: 'sales:edit', name: 'Edit Sale', description: 'Modify draft or open sales orders' },
      { id: 'sales:delete', name: 'Delete Sale', description: 'Void or cancel recorded transactions' },
      { id: 'sales:refund', name: 'Refund Sale', description: 'Issue customer refunds and credit returns' },
    ],
  },
  {
    id: 'products',
    name: 'Products',
    description: 'Product catalog, pricing, and service menus',
    permissions: [
      { id: 'products:view', name: 'View Products', description: 'See catalog, prices, and service descriptions' },
      { id: 'products:create', name: 'Add Products', description: 'Create new products or services in catalog' },
      { id: 'products:edit_prices', name: 'Edit Prices', description: 'Update product prices and discounts' },
      { id: 'products:delete', name: 'Delete Products', description: 'Remove products or archived services' },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'Stock levels, warehouse intake, and adjustments',
    permissions: [
      { id: 'inventory:view', name: 'View Stock', description: 'Check remaining stock and availability' },
      { id: 'inventory:adjust', name: 'Stock Adjustment', description: 'Update stock counts and restock logs' },
      { id: 'inventory:delete', name: 'Delete Stock Records', description: 'Remove damaged or scrap entries' },
    ],
  },
  {
    id: 'customers',
    name: 'Customers',
    description: 'Customer contact records, history, and notes',
    permissions: [
      { id: 'customers:view', name: 'View Customers', description: 'Search and read customer profiles' },
      { id: 'customers:create', name: 'Add Customers', description: 'Register new customers into the system' },
      { id: 'customers:edit', name: 'Edit Customers', description: 'Update customer contact info and notes' },
    ],
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Commercial reports, profit margins, and performance',
    permissions: [
      { id: 'reports:sales', name: 'Sales Reports', description: 'Review daily, weekly, and monthly sales graphs' },
      { id: 'reports:profit', name: 'Profit Reports', description: 'View cost of goods and gross profit summaries' },
      { id: 'reports:financial', name: 'Financial Reports', description: 'Export accounting and tax summaries' },
    ],
  },
  {
    id: 'team',
    name: 'Team & Staff',
    description: 'Staff accounts, role assignments, and permissions',
    permissions: [
      { id: 'users:read', name: 'View Team', description: 'See team members list and roles' },
      { id: 'users:invite', name: 'Add Team Member', description: 'Invite staff members to the workspace' },
      { id: 'users:write', name: 'Edit Team Member', description: 'Modify roles, branches, and member status' },
      { id: 'users:delete', name: 'Remove Team Member', description: 'Delete staff from workspace' },
    ],
  },
  {
    id: 'settings',
    name: 'Business Settings',
    description: 'Locations, customer channels, integrations, and company profile',
    permissions: [
      { id: 'tenant:write', name: 'Business Settings', description: 'Edit company name, currency, and details' },
      { id: 'businesses:write', name: 'Manage Locations', description: 'Add, edit, or remove branches' },
      { id: 'integrations:manage', name: 'Integrations & APIs', description: 'Configure external systems and webhooks' },
      { id: 'billing:manage', name: 'Billing & Plan', description: 'Manage platform subscription and payments' },
    ],
  },
];

export const ACCESS_LEVEL_PRESETS: Record<string, string[]> = {
  FULL: ['*'],
  MANAGER: [
    'sales:view',
    'sales:create',
    'sales:edit',
    'sales:refund',
    'products:view',
    'products:create',
    'products:edit_prices',
    'inventory:view',
    'inventory:adjust',
    'customers:view',
    'customers:create',
    'customers:edit',
    'reports:sales',
    'reports:profit',
    'users:read',
    'users:invite',
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
    'audit_logs:read',
  ],
  STANDARD: [
    'sales:view',
    'sales:create',
    'products:view',
    'inventory:view',
    'customers:view',
    'customers:create',
    'conversations:read',
    'conversations:write',
    'messages:read',
    'messages:write',
    'notifications:read',
  ],
  LIMITED: [
    'sales:view',
    'sales:create',
    'products:view',
    'customers:view',
    'conversations:read',
    'messages:read',
  ],
};

export const ROLE_TEMPLATES_BY_BUSINESS: Record<string, BusinessRoleTemplate[]> = {
  PHONE_SHOP: [
    {
      key: 'owner',
      name: 'Owner',
      baseRole: 'OWNER',
      accessLevel: 'FULL',
      description: 'Full business control across all locations, revenue, and staff',
      defaultPermissions: ACCESS_LEVEL_PRESETS.FULL,
    },
    {
      key: 'manager',
      name: 'Store Manager',
      baseRole: 'MANAGER',
      accessLevel: 'MANAGER',
      description: 'Oversees daily sales, inventory intake, team members, and reports',
      defaultPermissions: ACCESS_LEVEL_PRESETS.MANAGER,
    },
    {
      key: 'sales',
      name: 'Sales Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Handles walk-in and online sales, quotations, and customer support',
      defaultPermissions: ACCESS_LEVEL_PRESETS.STANDARD,
    },
    {
      key: 'cashier',
      name: 'Cashier',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Processes customer checkouts and payments at the billing counter',
      defaultPermissions: ACCESS_LEVEL_PRESETS.LIMITED,
    },
    {
      key: 'inventory',
      name: 'Inventory Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Receives device shipments, manages IMEI stock, and updates counts',
      defaultPermissions: [
        'inventory:view',
        'inventory:adjust',
        'products:view',
        'products:create',
        'conversations:read',
      ],
    },
    {
      key: 'technician',
      name: 'Repair Technician',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Diagnoses repairs, inspects spare parts, and updates repair tickets',
      defaultPermissions: [
        'sales:view',
        'products:view',
        'inventory:view',
        'customers:view',
        'conversations:read',
        'conversations:write',
      ],
    },
    {
      key: 'support',
      name: 'Customer Support',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Responds to customer inquiries across WhatsApp, chat, and phone',
      defaultPermissions: [
        'customers:view',
        'customers:create',
        'products:view',
        'conversations:read',
        'conversations:write',
        'messages:read',
        'messages:write',
      ],
    },
  ],

  SALON_SPA: [
    {
      key: 'owner',
      name: 'Owner',
      baseRole: 'OWNER',
      accessLevel: 'FULL',
      description: 'Full business control over services, stylists, finances, and branches',
      defaultPermissions: ACCESS_LEVEL_PRESETS.FULL,
    },
    {
      key: 'manager',
      name: 'Salon Manager',
      baseRole: 'MANAGER',
      accessLevel: 'MANAGER',
      description: 'Manages salon appointments, stylist shifts, retail stock, and sales',
      defaultPermissions: ACCESS_LEVEL_PRESETS.MANAGER,
    },
    {
      key: 'receptionist',
      name: 'Front-Desk Receptionist',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Welcomes clients, books appointments, answers inquiries, and takes payments',
      defaultPermissions: ACCESS_LEVEL_PRESETS.STANDARD,
    },
    {
      key: 'stylist',
      name: 'Hair Stylist',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Views assigned appointments, records treatments, and adds client notes',
      defaultPermissions: [
        'customers:view',
        'customers:create',
        'customers:edit',
        'products:view',
        'conversations:read',
        'conversations:write',
      ],
    },
    {
      key: 'beautician',
      name: 'Beautician / Esthetician',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Performs skin and beauty services, manages treatment history',
      defaultPermissions: [
        'customers:view',
        'customers:create',
        'products:view',
        'conversations:read',
      ],
    },
    {
      key: 'cashier',
      name: 'Cashier',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Bills client appointments and sells salon retail products',
      defaultPermissions: ACCESS_LEVEL_PRESETS.LIMITED,
    },
  ],

  RESTAURANT_CAFE: [
    {
      key: 'owner',
      name: 'Owner',
      baseRole: 'OWNER',
      accessLevel: 'FULL',
      description: 'Complete oversight of menu, kitchen operations, revenue, and branches',
      defaultPermissions: ACCESS_LEVEL_PRESETS.FULL,
    },
    {
      key: 'manager',
      name: 'Restaurant Manager',
      baseRole: 'MANAGER',
      accessLevel: 'MANAGER',
      description: 'Supervises front of house, staff shifts, table bookings, and reports',
      defaultPermissions: ACCESS_LEVEL_PRESETS.MANAGER,
    },
    {
      key: 'cashier',
      name: 'Cashier',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Settles table bills, prints receipts, and handles takeaways',
      defaultPermissions: ACCESS_LEVEL_PRESETS.LIMITED,
    },
    {
      key: 'waiter',
      name: 'Waiter / Server',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Takes table orders, checks food preparation status',
      defaultPermissions: ['sales:create', 'sales:view', 'products:view'],
    },
    {
      key: 'kitchen',
      name: 'Kitchen Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Monitors kitchen display orders and marks dishes completed',
      defaultPermissions: ['sales:view', 'products:view', 'inventory:view'],
    },
    {
      key: 'inventory',
      name: 'Inventory Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Receives ingredient deliveries and monitors cold storage stock',
      defaultPermissions: ['inventory:view', 'inventory:adjust', 'products:view'],
    },
  ],

  GROCERY_SUPERMARKET: [
    {
      key: 'owner',
      name: 'Owner',
      baseRole: 'OWNER',
      accessLevel: 'FULL',
      description: 'Full store chain oversight, supplier pricing, and financial control',
      defaultPermissions: ACCESS_LEVEL_PRESETS.FULL,
    },
    {
      key: 'manager',
      name: 'Branch Manager',
      baseRole: 'MANAGER',
      accessLevel: 'MANAGER',
      description: 'Supervises store aisles, cashier desks, stock refills, and reports',
      defaultPermissions: ACCESS_LEVEL_PRESETS.MANAGER,
    },
    {
      key: 'cashier',
      name: 'Cashier',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Scans items at checkout POS and accepts cash/card payments',
      defaultPermissions: ACCESS_LEVEL_PRESETS.LIMITED,
    },
    {
      key: 'sales',
      name: 'Sales Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Assists customers on the floor and checks item availability',
      defaultPermissions: ACCESS_LEVEL_PRESETS.STANDARD,
    },
    {
      key: 'inventory',
      name: 'Inventory Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Manages warehouse pallet intake, barcodes, and expiry audits',
      defaultPermissions: ['inventory:view', 'inventory:adjust', 'products:view', 'products:create'],
    },
    {
      key: 'delivery',
      name: 'Delivery Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Delivers customer groceries and updates order fulfillment',
      defaultPermissions: ['sales:view', 'customers:view'],
    },
  ],

  GENERAL_RETAIL: [
    {
      key: 'owner',
      name: 'Owner',
      baseRole: 'OWNER',
      accessLevel: 'FULL',
      description: 'Complete operational and financial control of the business',
      defaultPermissions: ACCESS_LEVEL_PRESETS.FULL,
    },
    {
      key: 'manager',
      name: 'General Manager',
      baseRole: 'MANAGER',
      accessLevel: 'MANAGER',
      description: 'Oversees daily business operations, staff, sales, and analytics',
      defaultPermissions: ACCESS_LEVEL_PRESETS.MANAGER,
    },
    {
      key: 'supervisor',
      name: 'Supervisor',
      baseRole: 'MANAGER',
      accessLevel: 'MANAGER',
      description: 'Directs shift staff, resolves customer escalations, reviews sales',
      defaultPermissions: [
        'sales:view',
        'sales:create',
        'sales:edit',
        'products:view',
        'inventory:view',
        'customers:view',
        'customers:create',
        'reports:sales',
        'users:read',
        'conversations:read',
        'conversations:write',
        'messages:read',
        'messages:write',
      ],
    },
    {
      key: 'sales',
      name: 'Sales Associate',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Handles customer requests, recommendations, and sales creation',
      defaultPermissions: ACCESS_LEVEL_PRESETS.STANDARD,
    },
    {
      key: 'cashier',
      name: 'Cashier',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Records payments, issues receipts, and balances checkout register',
      defaultPermissions: ACCESS_LEVEL_PRESETS.LIMITED,
    },
    {
      key: 'inventory',
      name: 'Inventory Staff',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Receives supplier deliveries, tracks shelves, updates stock',
      defaultPermissions: ['inventory:view', 'inventory:adjust', 'products:view', 'products:create'],
    },
    {
      key: 'accountant',
      name: 'Accountant',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Monitors revenues, checks sales reports, and handles invoices',
      defaultPermissions: ['sales:view', 'reports:sales', 'reports:profit', 'reports:financial'],
    },
    {
      key: 'support',
      name: 'Customer Service',
      baseRole: 'EMPLOYEE',
      accessLevel: 'STANDARD',
      description: 'Answers customer messages, inquiries, and provides assistance',
      defaultPermissions: [
        'customers:view',
        'customers:create',
        'products:view',
        'conversations:read',
        'conversations:write',
        'messages:read',
        'messages:write',
      ],
    },
    {
      key: 'staff',
      name: 'Staff Member',
      baseRole: 'EMPLOYEE',
      accessLevel: 'LIMITED',
      description: 'Standard operational staff with basic access to assist daily work',
      defaultPermissions: ACCESS_LEVEL_PRESETS.LIMITED,
    },
  ],
};

export function getRoleTemplatesForBusinessType(businessType?: string): BusinessRoleTemplate[] {
  if (!businessType) return ROLE_TEMPLATES_BY_BUSINESS.GENERAL_RETAIL;
  const normalized = businessType.toUpperCase().replace(/[\s-]/g, '_');
  return (
    ROLE_TEMPLATES_BY_BUSINESS[normalized] ||
    ROLE_TEMPLATES_BY_BUSINESS.GENERAL_RETAIL
  );
}
