"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
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
  Building,
  Factory,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Search,
  Check,
  Bot,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAiEmployeeTemplates, useApplyTemplate } from "@/lib/hooks/use-ai-employees";
import { useBusinesses, useUpdateBusiness } from "@/lib/hooks/use-businesses";
import { apiClient } from "@/lib/api-client";

const BUSINESS_TYPE_OPTIONS = [
  {
    id: "PHONE_SHOP",
    name: "Phone & Mobile Shop",
    category: "Retail",
    icon: Smartphone,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    desc: "Smartphones, repairs, accessories & device warranty inquiries",
  },
  {
    id: "SALON_SPA",
    name: "Salon & Spa",
    category: "Services",
    icon: Scissors,
    color: "bg-pink-50 text-pink-600 border-pink-200",
    desc: "Styling, beauty packages, appointments & customer reminders",
  },
  {
    id: "RESTAURANT_CAFE",
    name: "Restaurant & Café",
    category: "Hospitality",
    icon: Utensils,
    color: "bg-amber-50 text-amber-600 border-amber-200",
    desc: "Table reservations, menus, takeout orders & specials",
  },
  {
    id: "GROCERY_SUPERMARKET",
    name: "Grocery & Supermarket",
    category: "Retail",
    icon: ShoppingBag,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    desc: "Everyday items, inventory tracking & delivery ordering",
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
    id: "PHARMACY_STORE",
    name: "Pharmacy & Chemist",
    category: "Healthcare",
    icon: Pill,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    desc: "Prescription intake, health essentials & refill notices",
  },
  {
    id: "CLOTHING_BOUTIQUE",
    name: "Clothing & Fashion Boutique",
    category: "Retail",
    icon: Shirt,
    color: "bg-rose-50 text-rose-600 border-rose-200",
    desc: "Apparel styling, sizing assistance & seasonal collections",
  },
  {
    id: "BAKERY_CAFE",
    name: "Bakery & Pastry Shop",
    category: "Food & Beverage",
    icon: Cake,
    color: "bg-amber-50 text-amber-700 border-amber-300",
    desc: "Custom cakes, fresh batches, pre-orders & catering",
  },
  {
    id: "VEHICLE_SERVICE",
    name: "Vehicle Service & Garage",
    category: "Services",
    icon: Wrench,
    color: "bg-orange-50 text-orange-600 border-orange-200",
    desc: "Auto repair bookings, periodic maintenance & service quotes",
  },
  {
    id: "HARDWARE_SHOP",
    name: "Hardware & Construction",
    category: "Trade",
    icon: Hammer,
    color: "bg-slate-50 text-slate-700 border-slate-300",
    desc: "Tools, building supplies & contractor bulk quotations",
  },
  {
    id: "HOTEL_HOSPITALITY",
    name: "Hotel & Hospitality",
    category: "Hospitality",
    icon: Hotel,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    desc: "Room reservations, check-in instructions & guest concierge",
  },
  {
    id: "GYM_FITNESS",
    name: "Gym & Fitness Club",
    category: "Fitness",
    icon: Dumbbell,
    color: "bg-red-50 text-red-600 border-red-200",
    desc: "Membership signups, trainer sessions & class schedules",
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
    desc: "B2B tier pricing, volume bulk quotes & dispatch tracking",
  },
  {
    id: "ECOMMERCE_RETAIL",
    name: "Online E-Commerce Store",
    category: "Retail",
    icon: Globe,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    desc: "Online shopping assistant, order tracking & return policies",
  },
  {
    id: "GENERAL_RETAIL",
    name: "General Retail & Mart",
    category: "Retail",
    icon: Store,
    color: "bg-emerald-50 text-emerald-700 border-emerald-300",
    desc: "Retail store, product finder, price lookup & customer assistance",
  },
];

const BUSINESS_SIZES = [
  {
    id: "SMALL",
    name: "Small Business / Shop",
    desc: "1–5 team members · 1 primary location · Fast, simple setup",
    icon: Store,
  },
  {
    id: "MEDIUM",
    name: "Medium Business",
    desc: "6–25 team members · 1–3 locations · Growing operations",
    icon: Building,
  },
  {
    id: "LARGE",
    name: "Large Company",
    desc: "26–100 team members · Dedicated departments & managers",
    icon: Building,
  },
  {
    id: "ENTERPRISE",
    name: "Multi-Branch Enterprise",
    desc: "100+ team members · Multiple branches or franchise network",
    icon: Factory,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const businessesQuery = useBusinesses();
  const updateBusiness = useUpdateBusiness();
  const templatesQuery = useAiEmployeeTemplates();
  const applyTemplate = useApplyTemplate();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("PHONE_SHOP");
  const [searchTerm, setSearchTerm] = useState("");
  const [country, setCountry] = useState("United States");
  const [currency, setCurrency] = useState("USD ($)");
  const [businessSize, setBusinessSize] = useState<
    "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE"
  >("SMALL");
  const [selectedEmployeeKeys, setSelectedEmployeeKeys] = useState<string[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  // Prefill default name if available
  useEffect(() => {
    if (businessesQuery.data && businessesQuery.data.length > 0 && !businessName) {
      const defaultBiz = businessesQuery.data[0];
      if (defaultBiz.name && !defaultBiz.name.includes("'s Business")) {
        setBusinessName(defaultBiz.name);
      } else {
        setBusinessName("My Business");
      }
    }
  }, [businessesQuery.data, businessName]);

  const currentTemplate =
    templatesQuery.data?.find((t) => t.id === businessType) ||
    templatesQuery.data?.[0];

  // Auto-select all recommended employees when reaching step 3
  const handleGoToStep3 = () => {
    if (currentTemplate) {
      setSelectedEmployeeKeys(currentTemplate.employees.map((e) => e.key));
    }
    setStep(3);
  };

  const handleToggleEmployee = (key: string) => {
    if (selectedEmployeeKeys.includes(key)) {
      setSelectedEmployeeKeys(selectedEmployeeKeys.filter((k) => k !== key));
    } else {
      setSelectedEmployeeKeys([...selectedEmployeeKeys, key]);
    }
  };

  const handleSelectAllEmployees = () => {
    if (currentTemplate) {
      setSelectedEmployeeKeys(currentTemplate.employees.map((e) => e.key));
    }
  };

  const handleFinishAndLaunch = async () => {
    setIsLaunching(true);
    try {
      // 1. Update Tenant Name
      if (businessName.trim()) {
        try {
          await apiClient.patch("/tenants", { name: businessName.trim() });
        } catch {
          // Non-blocking fallback
        }

        // 2. Update Primary Business Location
        if (businessesQuery.data && businessesQuery.data.length > 0) {
          const primary = businessesQuery.data[0];
          await updateBusiness.mutateAsync({
            id: primary.id,
            name: businessName.trim(),
          });
        }
      }

      // 3. Deploy Selected AI Employees from chosen Business Template
      await applyTemplate.mutateAsync({
        businessType,
        businessSize,
        selectedKeys: selectedEmployeeKeys,
      });

      // 4. Redirect straight to Dashboard
      router.replace("/dashboard");
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      router.replace("/dashboard");
    } finally {
      setIsLaunching(false);
    }
  };

  const filteredTypes = BUSINESS_TYPE_OPTIONS.filter((opt) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      opt.name.toLowerCase().includes(q) ||
      opt.category.toLowerCase().includes(q) ||
      opt.desc.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-8">
      <div className="mx-auto w-full max-w-3xl">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-6 border-b border-line">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-ink-primary">
                Welcome to AI Employee Platform
              </h1>
              <p className="text-xs text-ink-secondary">
                Let&apos;s set up your business and configure your AI staff in 2 minutes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 px-3 py-1.5 rounded-full border border-brand-200">
            <span>Step {step} of 4</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 flex h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
          <div
            className="bg-brand-600 transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* STEP 1: CREATE BUSINESS */}
        {step === 1 && (
          <div className="mt-8 space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-xl font-bold text-ink-primary">
                Tell us about your business
              </h2>
              <p className="text-xs text-ink-secondary mt-1">
                We will personalize your AI employees, workflows, and dashboard to match your industry.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-primary">
                  Business Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Phone Shop or GlowDesk Salon"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-xl border border-line px-3.5 py-2.5 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-primary">
                    Country
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                  >
                    <option value="United States">United States</option>
                    <option value="Sri Lanka">Sri Lanka</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Australia">Australia</option>
                    <option value="Canada">Canada</option>
                    <option value="India">India</option>
                    <option value="United Arab Emirates">United Arab Emirates</option>
                    <option value="Singapore">Singapore</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-primary">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                  >
                    <option value="USD ($)">USD ($)</option>
                    <option value="LKR (Rs.)">LKR (Rs.)</option>
                    <option value="GBP (£)">GBP (£)</option>
                    <option value="EUR (€)">EUR (€)</option>
                    <option value="AUD ($)">AUD ($)</option>
                    <option value="CAD ($)">CAD ($)</option>
                    <option value="INR (₹)">INR (₹)</option>
                    <option value="AED (د.إ)">AED (د.إ)</option>
                  </select>
                </div>
              </div>

              {/* Business Type Search & Selector */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink-primary">
                    Select Business Type
                  </label>
                  <span className="text-[11px] text-ink-muted">
                    Choose closest match
                  </span>
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-ink-muted" />
                  <input
                    type="text"
                    placeholder="Search business types (e.g. Phone, Salon, Restaurant, Bakery, Clinic...)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-page pl-10 pr-4 py-2 text-xs text-ink-primary focus:border-brand-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1 pt-1">
                  {filteredTypes.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = businessType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBusinessType(opt.id)}
                        className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                          isSelected
                            ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500/20 shadow-xs"
                            : "border-line hover:border-slate-300 hover:bg-surface-page"
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${opt.color}`}
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
                          <p className="text-[10px] text-ink-secondary mt-0.5 line-clamp-1">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: BUSINESS SCALE */}
        {step === 2 && (
          <div className="mt-8 space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-xl font-bold text-ink-primary">
                How big is your business?
              </h2>
              <p className="text-xs text-ink-secondary mt-1">
                Helps configure how many AI employees you need and sets up multi-branch scoping.
              </p>
            </div>

            <div className="space-y-3">
              {BUSINESS_SIZES.map((size) => {
                const Icon = size.icon;
                const isSelected = businessSize === size.id;
                return (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() =>
                      setBusinessSize(
                        size.id as "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE"
                      )
                    }
                    className={`flex w-full items-center justify-between rounded-2xl border p-5 text-left transition-all ${
                      isSelected
                        ? "border-brand-600 bg-white ring-2 ring-brand-500/20 shadow-md"
                        : "border-line bg-white hover:border-slate-300 hover:bg-surface-page"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                          isSelected
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-surface-page text-ink-secondary border-line"
                        }`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-ink-primary">
                          {size.name}
                        </h4>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          {size.desc}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: RECOMMENDED AI EMPLOYEES */}
        {step === 3 && (
          <div className="mt-8 space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-ink-primary">
                  Recommended AI Employees for {currentTemplate?.name}
                </h2>
                <p className="text-xs text-ink-secondary mt-1">
                  We pre-selected the best AI staff for your business. Choose who you want to hire.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSelectAllEmployees}
                className="text-xs font-bold text-brand-600 hover:underline shrink-0"
              >
                Select All Recommended
              </button>
            </div>

            <div className="space-y-3">
              {currentTemplate?.employees.map((emp) => {
                const isSelected = selectedEmployeeKeys.includes(emp.key);
                return (
                  <div
                    key={emp.key}
                    onClick={() => handleToggleEmployee(emp.key)}
                    className={`flex cursor-pointer items-start justify-between rounded-2xl border p-4.5 transition-all ${
                      isSelected
                        ? "border-brand-500 bg-white ring-2 ring-brand-500/10 shadow-sm"
                        : "border-line/70 bg-white/60 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="mt-0.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xs font-bold text-ink-primary">
                            {emp.name}
                          </h4>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {emp.department}
                          </span>
                          {emp.actionLevel === "APPROVAL_REQUIRED" && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                              Requires Approval for Big Actions
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-secondary mt-1">
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

        {/* STEP 4: ONE-CLICK LAUNCH READY */}
        {step === 4 && (
          <div className="mt-8 space-y-6 text-center animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center justify-center p-8 rounded-3xl border border-line bg-white shadow-lg space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner">
                <ShieldCheck className="h-9 w-9" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-ink-primary">
                  Your AI Team is Ready!
                </h2>
                <p className="text-xs text-ink-secondary mt-1.5 max-w-md mx-auto">
                  <strong className="text-ink-primary">{selectedEmployeeKeys.length} AI Employees</strong> have been configured for{" "}
                  <strong className="text-ink-primary">{businessName || "your business"}</strong> with sensible safety rules.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left pt-2">
                <div className="rounded-xl bg-slate-50 p-3 border border-line">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">
                    Customer Service
                  </span>
                  <span className="text-xs font-bold text-ink-primary">
                    Answers questions &amp; recommends products 24/7
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 border border-line">
                  <span className="text-[10px] uppercase font-bold text-ink-muted block">
                    Owner Safety
                  </span>
                  <span className="text-xs font-bold text-ink-primary">
                    Sensitive actions wait for your approval
                  </span>
                </div>
              </div>

              <div className="pt-4 w-full max-w-sm">
                <button
                  type="button"
                  onClick={handleFinishAndLaunch}
                  disabled={isLaunching}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-xs font-bold text-white shadow-md hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  <Bot className="h-4 w-4" />
                  {isLaunching ? "Deploying Your AI Staff..." : "Go to My Business Dashboard →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Navigation Buttons */}
        <div className="mt-8 flex items-center justify-between pt-4 border-t border-line">
          {step > 1 && step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-ink-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1) setStep(2);
                else handleGoToStep3();
              }}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : step === 3 ? (
            <button
              type="button"
              onClick={() => setStep(4)}
              disabled={selectedEmployeeKeys.length === 0}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              Review &amp; Finish ({selectedEmployeeKeys.length}) <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
