"use client";

import React, { useState } from "react";
import {
  X,
  Sparkles,
  Smartphone,
  Scissors,
  Utensils,
  ShoppingBag,
  Stethoscope,
  Globe,
  Wrench,
  Hammer,
  Hotel,
  Cake,
  Shirt,
  Pill,
  Dumbbell,
  Home,
  Truck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Bot,
  Building,
  Store,
  Factory,
  ShieldCheck,
  Search,
} from "lucide-react";
import { useAiEmployeeTemplates, useApplyTemplate } from "@/lib/hooks/use-ai-employees";

interface OnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const BUSINESS_TYPE_OPTIONS = [
  {
    id: "PHONE_SHOP",
    name: "Phone & Mobile Shop",
    category: "Retail",
    icon: Smartphone,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    desc: "Smartphones, accessories, warranty, repairs & trade-ins",
  },
  {
    id: "SALON_SPA",
    name: "Salon & Spa",
    category: "Services",
    icon: Scissors,
    color: "bg-pink-50 text-pink-600 border-pink-200",
    desc: "Hair styling, beauty packages, appointments & reminders",
  },
  {
    id: "RESTAURANT_CAFE",
    name: "Restaurant & Café",
    category: "Hospitality",
    icon: Utensils,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    desc: "Table reservations, takeout orders, daily specials & catering",
  },
  {
    id: "GROCERY_SUPERMARKET",
    name: "Grocery & Supermarket",
    category: "Retail",
    icon: ShoppingBag,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "Inventory tracking, grocery deliveries & reordering",
  },
  {
    id: "CLINIC_MEDICAL",
    name: "Clinic & Medical Center",
    category: "Healthcare",
    icon: Stethoscope,
    color: "bg-cyan-50 text-cyan-600 border-cyan-200",
    desc: "Doctor appointments, clinic timings & patient triage",
  },
  {
    id: "ECOMMERCE_RETAIL",
    name: "E-Commerce Store",
    category: "Retail",
    icon: Globe,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    desc: "Online shopping assistant, order tracking & returns",
  },
  {
    id: "VEHICLE_SERVICE",
    name: "Vehicle Service & Garage",
    category: "Services",
    icon: Wrench,
    color: "bg-orange-50 text-orange-600 border-orange-200",
    desc: "Auto repair, service bookings & maintenance scheduling",
  },
  {
    id: "HARDWARE_SHOP",
    name: "Hardware & Construction",
    category: "Trade",
    icon: Hammer,
    color: "bg-slate-50 text-slate-700 border-slate-300",
    desc: "Tools, electrical, plumbing & contractor bulk quotes",
  },
  {
    id: "HOTEL_HOSPITALITY",
    name: "Hotel & Hospitality",
    category: "Hospitality",
    icon: Hotel,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    desc: "Room reservations, check-in, concierge & guest inquiries",
  },
  {
    id: "BAKERY_CAFE",
    name: "Bakery & Pastry Shop",
    category: "Food & Beverage",
    icon: Cake,
    color: "bg-amber-50 text-amber-700 border-amber-300",
    desc: "Custom cake bookings, pre-orders, allergen alerts & catering",
  },
  {
    id: "CLOTHING_BOUTIQUE",
    name: "Clothing Boutique",
    category: "Retail",
    icon: Shirt,
    color: "bg-rose-50 text-rose-600 border-rose-200",
    desc: "Apparel styling, sizing assistance & seasonal collections",
  },
  {
    id: "PHARMACY_STORE",
    name: "Pharmacy & Chemist",
    category: "Healthcare",
    icon: Pill,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    desc: "Prescription intake, health wellness & refill reminders",
  },
  {
    id: "GYM_FITNESS",
    name: "Gym & Fitness Club",
    category: "Fitness",
    icon: Dumbbell,
    color: "bg-red-50 text-red-600 border-red-200",
    desc: "Membership signups, personal trainer bookings & class schedules",
  },
  {
    id: "REAL_ESTATE",
    name: "Real Estate Agency",
    category: "Property",
    icon: Home,
    color: "bg-blue-50 text-blue-700 border-blue-300",
    desc: "Property listings, client viewing schedules & buyer qualification",
  },
  {
    id: "WHOLESALE_DISTRIBUTION",
    name: "Wholesale & Distribution",
    category: "B2B",
    icon: Truck,
    color: "bg-sky-50 text-sky-700 border-sky-300",
    desc: "B2B tier pricing, bulk volume discounts & dispatch tracking",
  },
  {
    id: "GENERAL_RETAIL",
    name: "General Retail & Mart",
    category: "Retail",
    icon: Store,
    color: "bg-emerald-50 text-emerald-700 border-emerald-300",
    desc: "Versatile retail support, product finder & order lookups",
  },
];

const BUSINESS_SIZES = [
  {
    id: "SMALL",
    name: "Small Shop",
    desc: "1–5 staff · 1 primary location · Fast setup",
    icon: Store,
  },
  {
    id: "MEDIUM",
    name: "Medium Business",
    desc: "6–25 staff · 1–3 branches · Growing operations",
    icon: Building,
  },
  {
    id: "LARGE",
    name: "Large Company",
    desc: "26–100 staff · Regional presence · Dedicated departments",
    icon: Building,
  },
  {
    id: "ENTERPRISE",
    name: "Multi-Branch Enterprise",
    desc: "100+ staff · Multiple branches/franchises",
    icon: Factory,
  },
];

export function OnboardingWizardModal({
  isOpen,
  onClose,
  onSuccess,
}: OnboardingWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState("PHONE_SHOP");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSize, setSelectedSize] = useState<
    "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE"
  >("SMALL");
  const [selectedEmployeeKeys, setSelectedEmployeeKeys] = useState<string[]>([]);

  const templatesQuery = useAiEmployeeTemplates();
  const applyTemplate = useApplyTemplate();

  if (!isOpen) return null;

  const currentTemplate =
    templatesQuery.data?.find((t) => t.id === selectedType) ||
    templatesQuery.data?.[0];

  // Initialize selected keys when arriving at step 3
  const handleProceedToStep3 = () => {
    if (currentTemplate && selectedEmployeeKeys.length === 0) {
      setSelectedEmployeeKeys(currentTemplate.employees.map((e) => e.key));
    }
    setStep(3);
  };

  const handleToggleEmployeeKey = (key: string) => {
    if (selectedEmployeeKeys.includes(key)) {
      setSelectedEmployeeKeys(selectedEmployeeKeys.filter((k) => k !== key));
    } else {
      setSelectedEmployeeKeys([...selectedEmployeeKeys, key]);
    }
  };

  const handleDeploy = async () => {
    await applyTemplate.mutateAsync({
      businessType: selectedType,
      selectedKeys: selectedEmployeeKeys,
    });
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/40 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-line bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface-page">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink-primary">
                AI Employee Onboarding Wizard
              </h3>
              <p className="text-[11px] text-ink-secondary">
                Step {step} of 3:{" "}
                {step === 1
                  ? "Select Business Type"
                  : step === 2
                  ? "Select Business Scale"
                  : "Review Suggested AI Employees"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-muted hover:bg-white hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="flex h-1.5 w-full bg-slate-100">
          <div
            className="bg-brand-600 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP 1: SELECT BUSINESS TYPE */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-bold text-ink-primary">
                  What type of business do you run?
                </h4>
                <p className="text-xs text-ink-secondary">
                  We will automatically configure the appropriate roles, permissions, and tools.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Search business types (e.g. Pharmacy, Bakery, Salon, Hotel, Gym...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-page pl-10 pr-4 py-2 text-xs text-ink-primary focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              {BUSINESS_TYPE_OPTIONS.filter((opt) => {
                if (!searchTerm.trim()) return true;
                const q = searchTerm.toLowerCase();
                return (
                  opt.name.toLowerCase().includes(q) ||
                  opt.category.toLowerCase().includes(q) ||
                  opt.desc.toLowerCase().includes(q)
                );
              }).length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-8 text-center">
                  <p className="text-xs font-semibold text-ink-secondary">
                    No business types match &ldquo;{searchTerm}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="mt-2 text-xs text-brand-600 font-bold hover:underline"
                  >
                    Clear search and view all
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {BUSINESS_TYPE_OPTIONS.filter((opt) => {
                    if (!searchTerm.trim()) return true;
                    const q = searchTerm.toLowerCase();
                    return (
                      opt.name.toLowerCase().includes(q) ||
                      opt.category.toLowerCase().includes(q) ||
                      opt.desc.toLowerCase().includes(q)
                    );
                  }).map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = selectedType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedType(opt.id)}
                        className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                          isSelected
                            ? "border-brand-600 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-xs"
                            : "border-line hover:border-brand-200 hover:bg-surface-page"
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${opt.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-ink-primary text-xs truncate">
                              {opt.name}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 text-brand-600" />
                            )}
                          </div>
                          <p className="text-[11px] text-ink-secondary mt-0.5 line-clamp-2">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: SELECT BUSINESS SCALE */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-bold text-ink-primary">
                  What is the size of your business?
                </h4>
                <p className="text-xs text-ink-secondary">
                  Helps calculate workflow depth, multi-branch scoping, and approval thresholds.
                </p>
              </div>

              <div className="space-y-2.5">
                {BUSINESS_SIZES.map((size) => {
                  const Icon = size.icon;
                  const isSelected = selectedSize === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() =>
                        setSelectedSize(
                          size.id as "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE"
                        )
                      }
                      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? "border-brand-600 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-xs"
                          : "border-line hover:border-brand-200 hover:bg-surface-page"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                            isSelected
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-surface-page text-ink-secondary border-line"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h5 className="text-sm font-bold text-ink-primary">
                            {size.name}
                          </h5>
                          <p className="text-xs text-ink-secondary">{size.desc}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-brand-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & DEPLOY SUGGESTED AI EMPLOYEES */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-bold text-ink-primary">
                  Suggested AI Employees for {currentTemplate?.name}
                </h4>
                <p className="text-xs text-ink-secondary">
                  Choose which AI employees you want to hire. You can customize their responsibilities, permissions, and locations later.
                </p>
              </div>

              <div className="space-y-2.5">
                {currentTemplate?.employees.map((emp) => {
                  const isChecked = selectedEmployeeKeys.includes(emp.key);
                  return (
                    <div
                      key={emp.key}
                      onClick={() => handleToggleEmployeeKey(emp.key)}
                      className={`flex cursor-pointer items-start justify-between rounded-xl border p-3.5 transition-all ${
                        isChecked
                          ? "border-brand-500 bg-white ring-1 ring-brand-500/20 shadow-xs"
                          : "border-line/70 bg-surface-page/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="mt-1 h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-ink-primary">
                              {emp.name}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700">
                              {emp.department}
                            </span>
                            {emp.actionLevel === "APPROVAL_REQUIRED" && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                Requires Approval
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            {emp.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between border-t border-line px-6 py-4 bg-surface-page">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              className="flex items-center gap-1 text-xs font-semibold text-ink-secondary hover:text-ink-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1) setStep(2);
                else handleProceedToStep3();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors"
            >
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDeploy}
              disabled={applyTemplate.isPending || selectedEmployeeKeys.length === 0}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {applyTemplate.isPending
                ? "Deploying AI Employees..."
                : `Deploy ${selectedEmployeeKeys.length} AI Employees`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
