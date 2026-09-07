"use client";

import React from "react";
import { Check, ShieldAlert, ShieldCheck, Lock } from "lucide-react";

interface PermissionItem {
  key: string;
  label: string;
  description: string;
  level: "AUTOMATIC" | "APPROVAL_REQUIRED" | "OWNER_ONLY";
}

interface PermissionGroup {
  name: string;
  permissions: PermissionItem[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    name: "Products & Pricing",
    permissions: [
      {
        key: "viewProducts",
        label: "View Products",
        description: "Can search and read product specs, availability and descriptions.",
        level: "AUTOMATIC",
      },
      {
        key: "viewPrices",
        label: "View Prices",
        description: "Can check current retail and promotional prices.",
        level: "AUTOMATIC",
      },
      {
        key: "editPrices",
        label: "Change Product Prices",
        description: "Can modify pricing or apply large custom discounts.",
        level: "APPROVAL_REQUIRED",
      },
      {
        key: "deleteProducts",
        label: "Delete Products",
        description: "Permanently removes products from inventory catalog.",
        level: "OWNER_ONLY",
      },
    ],
  },
  {
    name: "Sales & Orders",
    permissions: [
      {
        key: "createQuotations",
        label: "Create Quotations",
        description: "Can generate official price estimates and bundle quotes for leads.",
        level: "AUTOMATIC",
      },
      {
        key: "createOrders",
        label: "Create Orders",
        description: "Can initiate customer orders, cart checkouts, and invoices.",
        level: "AUTOMATIC",
      },
      {
        key: "refundMoney",
        label: "Refund Money",
        description: "Processes payment cancellations and customer refund returns.",
        level: "APPROVAL_REQUIRED",
      },
    ],
  },
  {
    name: "Inventory & Stock",
    permissions: [
      {
        key: "checkStock",
        label: "Check Stock Levels",
        description: "Reads live inventory quantities across warehouses and branches.",
        level: "AUTOMATIC",
      },
      {
        key: "createPurchaseOrders",
        label: "Draft Purchase Orders",
        description: "Prepares vendor restocking orders when inventory drops low.",
        level: "APPROVAL_REQUIRED",
      },
    ],
  },
  {
    name: "Customer & Administration",
    permissions: [
      {
        key: "viewCustomers",
        label: "View Customer Profiles",
        description: "Reads customer contact info, purchase history, and notes.",
        level: "AUTOMATIC",
      },
      {
        key: "viewProfit",
        label: "View Business Financials & Profit",
        description: "Accesses revenue margins, cost figures, and profit reports.",
        level: "APPROVAL_REQUIRED",
      },
      {
        key: "changeSettings",
        label: "Change Business Settings",
        description: "Modifies store hours, tax settings, and platform configuration.",
        level: "OWNER_ONLY",
      },
    ],
  },
];

interface PermissionMatrixProps {
  permissions: Record<string, boolean>;
  onChange?: (newPermissions: Record<string, boolean>) => void;
  readOnly?: boolean;
}

export function PermissionMatrix({
  permissions,
  onChange,
  readOnly = false,
}: PermissionMatrixProps) {
  const handleToggle = (key: string, level: string) => {
    if (readOnly || level === "OWNER_ONLY") return;
    if (onChange) {
      onChange({
        ...permissions,
        [key]: !permissions[key],
      });
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "APPROVAL_REQUIRED":
        return (
          <span className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
            <ShieldAlert className="h-2.5 w-2.5" />
            Level 2 · Approval Required
          </span>
        );
      case "OWNER_ONLY":
        return (
          <span className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 border border-red-200">
            <Lock className="h-2.5 w-2.5" />
            Level 3 · Owner Only
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
            <ShieldCheck className="h-2.5 w-2.5" />
            Level 1 · Automatic
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.name} className="rounded-xl border border-line bg-white p-4 shadow-xs">
          <h4 className="font-bold text-ink-primary text-xs uppercase tracking-wider mb-3">
            {group.name}
          </h4>

          <div className="divide-y divide-line/60">
            {group.permissions.map((perm) => {
              const isChecked = Boolean(permissions[perm.key]);
              const isLocked = perm.level === "OWNER_ONLY";

              return (
                <div
                  key={perm.key}
                  className="flex items-start justify-between py-3 gap-4 first:pt-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-primary">
                        {perm.label}
                      </span>
                      {getLevelBadge(perm.level)}
                    </div>
                    <p className="text-xs text-ink-secondary">{perm.description}</p>
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isChecked}
                      disabled={readOnly || isLocked}
                      onClick={() => handleToggle(perm.key, perm.level)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        isLocked
                          ? "bg-slate-200 cursor-not-allowed opacity-60"
                          : isChecked
                          ? "bg-brand-600 hover:bg-brand-700"
                          : "bg-slate-200 hover:bg-slate-300"
                      }`}
                      title={isLocked ? "Restricted to owner only" : undefined}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                          isChecked && !isLocked ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
