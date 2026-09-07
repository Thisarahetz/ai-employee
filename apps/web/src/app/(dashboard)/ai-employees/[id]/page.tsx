"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Save,
  Trash2,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  Sliders,
  Check,
} from "lucide-react";
import {
  useAiEmployee,
  useUpdateAiEmployee,
  useDeleteAiEmployee,
  useToggleEmployeeStatus,
} from "@/lib/hooks/use-ai-employees";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { PermissionMatrix } from "@/components/ai-employee/permission-matrix";
import { ActivityTimeline } from "@/components/ai-employee/activity-timeline";
import { ApprovalCard } from "@/components/ai-employee/approval-card";
import { Modal } from "@/components/ui/modal";
import { FullPageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { getErrorMessage } from "@/lib/utils";
import { ActionLevel, EmployeeScope, EmployeeTask } from "@/lib/types";

export default function AiEmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const employeeQuery = useAiEmployee(id);
  const updateEmployee = useUpdateAiEmployee();
  const deleteEmployee = useDeleteAiEmployee();
  const toggleStatus = useToggleEmployeeStatus();
  const businessesQuery = useBusinesses();

  const [activeTab, setActiveTab] = useState<
    "PROFILE" | "TASKS" | "PERMISSIONS" | "APPROVALS" | "PERFORMANCE"
  >("PROFILE");

  // Form State
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [businessFunction, setBusinessFunction] = useState("");
  const [description, setDescription] = useState("");
  const [actionLevel, setActionLevel] = useState<ActionLevel>("AUTOMATIC");
  const [scope, setScope] = useState<EmployeeScope>("ALL_BRANCHES");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [responsibilities, setResponsibilities] = useState<string[]>([]);
  const [newResponsibility, setNewResponsibility] = useState("");
  const [assignedTasks, setAssignedTasks] = useState<EmployeeTask[]>([]);
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskCategory, setNewTaskCategory] =
    useState<EmployeeTask["category"]>("SALES");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Sync state when employee data loads
  useEffect(() => {
    if (employeeQuery.data) {
      const emp = employeeQuery.data;
      setName(emp.name);
      setRole(emp.role);
      setDepartment(emp.department);
      setBusinessFunction(emp.businessFunction);
      setDescription(emp.description);
      setActionLevel(emp.actionLevel);
      setScope(emp.scope);
      setBranchIds(emp.branchIds || []);
      setResponsibilities(emp.responsibilities || []);
      setAssignedTasks(emp.assignedTasks || []);
      setPermissions(emp.permissions || {});
    }
  }, [employeeQuery.data]);

  if (employeeQuery.isLoading) return <FullPageSpinner />;
  if (employeeQuery.isError || !employeeQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(employeeQuery.error, "AI Employee not found.")}
        onRetry={() => employeeQuery.refetch()}
      />
    );
  }

  const employee = employeeQuery.data;
  const isActive = employee.status === "ACTIVE";

  const handleSave = async () => {
    await updateEmployee.mutateAsync({
      id: employee.id,
      data: {
        name,
        role,
        department,
        businessFunction,
        description,
        actionLevel,
        scope,
        branchIds,
        responsibilities,
        assignedTasks,
        permissions,
      },
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleToggleTask = (taskName: string) => {
    setAssignedTasks((prev) =>
      prev.map((t) => (t.task === taskName ? { ...t, isEnabled: !t.isEnabled } : t))
    );
  };

  const handleAddTask = () => {
    if (!newTaskDescription.trim()) return;
    setAssignedTasks((prev) => [
      ...prev,
      {
        task: newTaskDescription.trim(),
        isEnabled: true,
        category: newTaskCategory,
      },
    ]);
    setNewTaskDescription("");
  };

  const handleRemoveTask = (index: number) => {
    setAssignedTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddResponsibility = () => {
    if (!newResponsibility.trim()) return;
    setResponsibilities([...responsibilities, newResponsibility.trim()]);
    setNewResponsibility("");
  };

  const handleRemoveResponsibility = (index: number) => {
    setResponsibilities(responsibilities.filter((_, i) => i !== index));
  };

  const handleToggleBranch = (bId: string) => {
    if (branchIds.includes(bId)) {
      setBranchIds(branchIds.filter((b) => b !== bId));
    } else {
      setBranchIds([...branchIds, bId]);
    }
  };

  const handleDelete = () => {
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    await deleteEmployee.mutateAsync(employee.id);
    setIsDeleteModalOpen(false);
    router.replace("/ai-employees");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Back and Top Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 hover:text-brand-700">
          <Link href="/ai-employees" className="flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to AI Employees
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Toggle Button */}
          <button
            type="button"
            onClick={() =>
              toggleStatus.mutate({
                id: employee.id,
                status: isActive ? "PAUSED" : "ACTIVE",
              })
            }
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
              isActive
                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isActive ? "bg-emerald-600" : "bg-slate-500"
              }`}
            />
            {isActive ? "Active (Click to Pause)" : "Paused (Click to Activate)"}
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={updateEmployee.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-300" /> Saved!
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Save Changes
              </>
            )}
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={handleDelete}
            title="Delete this AI Employee"
            className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Header Profile Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
            <Bot className="h-8 w-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-ink-primary">{name}</h2>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
                {department}
              </span>
            </div>
            <p className="text-xs text-ink-secondary mt-0.5 font-medium">{role}</p>
            <p className="text-xs text-ink-muted mt-1">{description}</p>
          </div>
        </div>

        {/* Quick Stats Pill */}
        <div className="flex items-center gap-4 rounded-xl bg-surface-page p-3 border border-line/60">
          <div className="text-center px-2">
            <span className="text-[10px] uppercase font-bold text-ink-muted block">
              Conversations
            </span>
            <span className="text-base font-bold text-ink-primary">
              {employee.stats?.conversations ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-line" />
          <div className="text-center px-2">
            <span className="text-[10px] uppercase font-bold text-ink-muted block">
              Orders Assisted
            </span>
            <span className="text-base font-bold text-emerald-600">
              {employee.stats?.ordersAssisted ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-line" />
          <div className="text-center px-2">
            <span className="text-[10px] uppercase font-bold text-ink-muted block">
              Success Rate
            </span>
            <span className="text-base font-bold text-brand-600">
              {employee.stats?.successRate ?? 95}%
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex overflow-x-auto border-b border-line gap-2 pb-px">
        {[
          { key: "PROFILE", label: "Profile & Scope" },
          { key: "TASKS", label: `Assigned Tasks (${assignedTasks.filter((t) => t.isEnabled).length})` },
          { key: "PERMISSIONS", label: "Permissions Matrix" },
          { key: "APPROVALS", label: `Safety & Approvals (${employee.approvals?.length || 0})` },
          { key: "PERFORMANCE", label: "Activity & Performance" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            className={`whitespace-nowrap px-4 py-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === tab.key
                ? "border-brand-600 text-brand-700 bg-brand-50/40 rounded-t-lg"
                : "border-transparent text-ink-secondary hover:text-ink-primary hover:border-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PROFILE & SCOPE */}
      {activeTab === "PROFILE" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
                Basic Details
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-secondary">
                    Employee Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-secondary">
                    Role Title
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-secondary">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                  >
                    <option value="Sales">Sales</option>
                    <option value="Customer Support">Customer Support</option>
                    <option value="Inventory">Inventory</option>
                    <option value="Operations">Operations</option>
                    <option value="Finance">Finance</option>
                    <option value="Marketing">Marketing</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-secondary">
                    Primary Business Function
                  </label>
                  <input
                    type="text"
                    value={businessFunction}
                    onChange={(e) => setBusinessFunction(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-secondary">
                  Job Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Responsibilities */}
            <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
                Core Responsibilities
              </h3>
              <p className="text-xs text-ink-secondary">
                Key duties this AI employee focuses on when interacting with customers or internal systems.
              </p>

              <div className="space-y-2">
                {responsibilities.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-surface-page px-3 py-2 text-xs text-ink-primary border border-line/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-brand-600 font-bold">•</span>
                      <span>{r}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveResponsibility(i)}
                      className="text-ink-muted hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Add a new responsibility (e.g. Recommend accessory bundles)..."
                  value={newResponsibility}
                  onChange={(e) => setNewResponsibility(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddResponsibility()}
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddResponsibility}
                  className="rounded-lg bg-brand-50 px-3.5 py-2 text-xs font-bold text-brand-700 border border-brand-200 hover:bg-brand-100"
                >
                  Add Duty
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Multi-branch Scope */}
          <div className="space-y-6">
            <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
                  Location &amp; Branch Scope
                </h3>
              </div>
              <p className="text-xs text-ink-secondary">
                Specify which stores or branches this AI employee is deployed to.
              </p>

              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "ALL_BRANCHES"}
                    onChange={() => setScope("ALL_BRANCHES")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs font-semibold text-ink-primary">
                    Entire Company (All Branches)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "SELECTED_BRANCHES"}
                    onChange={() => setScope("SELECTED_BRANCHES")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs font-semibold text-ink-primary">
                    Selected Branches Only
                  </span>
                </label>
              </div>

              {scope === "SELECTED_BRANCHES" && (
                <div className="mt-3 rounded-lg bg-surface-page p-3 border border-line/60 space-y-2">
                  <span className="text-[11px] font-semibold text-ink-secondary block">
                    Choose Active Branches:
                  </span>
                  {businessesQuery.data?.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-xs text-ink-primary cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={branchIds.includes(b.id)}
                        onChange={() => handleToggleBranch(b.id)}
                        className="rounded border-line text-brand-600 focus:ring-brand-500"
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TASKS & CAPABILITIES */}
      {activeTab === "TASKS" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider mb-1">
              Assigned Business Tasks
            </h3>
            <p className="text-xs text-ink-secondary mb-4">
              Toggle specific tasks ON or OFF. Disabled tasks will never be executed by this AI employee.
            </p>

            {assignedTasks.length === 0 ? (
              <p className="text-xs text-ink-muted py-4 text-center">No specific tasks assigned yet. Add one below.</p>
            ) : (
              <div className="divide-y divide-line/60">
                {assignedTasks.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink-primary truncate">
                          {t.task}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 shrink-0">
                          {t.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={t.isEnabled}
                        onClick={() => handleToggleTask(t.task)}
                        className={`relative h-6 w-11 rounded-full transition-colors ${
                          t.isEnabled ? "bg-brand-600" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                            t.isEnabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTask(i)}
                        title="Remove task"
                        className="p-1 text-ink-muted hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Custom Task Form */}
            <div className="mt-5 border-t border-line pt-4">
              <span className="text-xs font-bold text-ink-primary block mb-2">
                Add Custom Business Task
              </span>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="Task description (e.g. Schedule next-day follow-ups with VIP customers)..."
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
                />
                <select
                  value={newTaskCategory}
                  onChange={(e) =>
                    setNewTaskCategory(e.target.value as EmployeeTask["category"])
                  }
                  className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none shrink-0"
                >
                  <option value="SALES">Sales</option>
                  <option value="CUSTOMER">Customer Service</option>
                  <option value="INVENTORY">Inventory</option>
                  <option value="OPERATIONS">Operations</option>
                  <option value="FINANCE">Finance</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors shrink-0"
                >
                  + Add Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PERMISSIONS MATRIX */}
      {activeTab === "PERMISSIONS" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider mb-1">
              AI Employee Access Permissions
            </h3>
            <p className="text-xs text-ink-secondary mb-4">
              Control what business data and operations this employee can access. Sensitive actions require owner authorization.
            </p>

            <PermissionMatrix
              permissions={permissions}
              onChange={(newPerms) => setPermissions(newPerms)}
            />
          </div>
        </div>
      )}

      {/* TAB 4: SAFETY & APPROVALS */}
      {activeTab === "APPROVALS" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
              Autonomy &amp; Safety Level
            </h3>
            <p className="text-xs text-ink-secondary">
              Determines when this AI employee acts automatically versus when it asks you first.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  id: "AUTOMATIC",
                  title: "Level 1: Automatic",
                  desc: "Performs common customer inquiries, recommendations, and safe tasks independently.",
                  icon: ShieldCheck,
                  badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
                },
                {
                  id: "APPROVAL_REQUIRED",
                  title: "Level 2: Approval Required",
                  desc: "Prepares sensitive actions (discounts, refunds, purchase orders) but waits for owner review.",
                  icon: ShieldAlert,
                  badge: "bg-amber-50 text-amber-700 border-amber-200",
                },
                {
                  id: "OWNER_ONLY",
                  title: "Level 3: Restricted",
                  desc: "AI is blocked from executing actions; only answers informational questions.",
                  icon: Lock,
                  badge: "bg-red-50 text-red-700 border-red-200",
                },
              ].map((lvl) => {
                const Icon = lvl.icon;
                const isSelected = actionLevel === lvl.id;
                return (
                  <div
                    key={lvl.id}
                    onClick={() => setActionLevel(lvl.id as ActionLevel)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? "border-brand-600 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-xs"
                        : "border-line hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-4 w-4 text-brand-600" />
                      <span className="text-xs font-bold text-ink-primary">
                        {lvl.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      {lvl.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Employee's Pending & Past Approvals */}
          <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
              Action Authorization History
            </h3>
            {employee.approvals && employee.approvals.length > 0 ? (
              <div className="space-y-3">
                {employee.approvals.map((appr) => (
                  <ApprovalCard key={appr.id} approval={appr} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-muted">
                No authorization requests currently pending for {employee.name}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: PERFORMANCE & ACTIVITY */}
      {activeTab === "PERFORMANCE" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-white p-4 shadow-xs text-center">
              <span className="text-[10px] uppercase font-bold text-ink-muted block">
                Conversations Handled
              </span>
              <span className="text-2xl font-bold text-ink-primary">
                {employee.stats?.conversations ?? 0}
              </span>
            </div>
            <div className="rounded-xl border border-line bg-white p-4 shadow-xs text-center">
              <span className="text-[10px] uppercase font-bold text-ink-muted block">
                Orders Assisted
              </span>
              <span className="text-2xl font-bold text-emerald-600">
                {employee.stats?.ordersAssisted ?? 0}
              </span>
            </div>
            <div className="rounded-xl border border-line bg-white p-4 shadow-xs text-center">
              <span className="text-[10px] uppercase font-bold text-ink-muted block">
                Tasks Completed
              </span>
              <span className="text-2xl font-bold text-brand-600">
                {employee.stats?.tasksCompleted ?? 0}
              </span>
            </div>
            <div className="rounded-xl border border-line bg-white p-4 shadow-xs text-center">
              <span className="text-[10px] uppercase font-bold text-ink-muted block">
                Success Rate
              </span>
              <span className="text-2xl font-bold text-emerald-600">
                {employee.stats?.successRate ?? 95}%
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider">
              Recent Activity Timeline
            </h3>
            <ActivityTimeline employeeId={employee.id} />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete AI Employee"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 border border-red-200">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-red-900">Permanent Deletion</h4>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                Are you sure you want to delete <strong className="font-semibold">{employee.name}</strong>? All assigned tasks, branch configurations, and activity records for this AI employee will be removed.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface-page"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteEmployee.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteEmployee.isPending ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
