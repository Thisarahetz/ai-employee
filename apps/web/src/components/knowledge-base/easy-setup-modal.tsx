"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Smartphone,
  Scissors,
  Utensils,
  Stethoscope,
  ShoppingBag,
  Wrench,
  Store,
  CheckCircle2,
  FileText,
  Clock,
  HelpCircle,
  ShieldCheck,
  Building2,
  ChevronRight,
  Layers,
  Check,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import type { KnowledgeBase } from "@/lib/types";
import {
  INDUSTRY_STARTER_PACKS,
  compileCustomBusinessDocs,
  type BusinessTemplateDoc,
} from "@/lib/knowledge-base-templates";

interface EasySetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingKnowledgeBases?: KnowledgeBase[];
  defaultBusinessName?: string;
  defaultCurrency?: string;
}

const INDUSTRY_ICONS: Record<string, React.ElementType> = {
  PHONE_SHOP: Smartphone,
  SALON_SPA: Scissors,
  RESTAURANT_CAFE: Utensils,
  CLINIC_MEDICAL: Stethoscope,
  GROCERY_SUPERMARKET: ShoppingBag,
  VEHICLE_SERVICE: Wrench,
  GENERAL_RETAIL: Store,
};

export function EasySetupModal({
  isOpen,
  onClose,
  onSuccess,
  existingKnowledgeBases = [],
  defaultBusinessName = "",
  defaultCurrency = "USD ($)",
}: EasySetupModalProps) {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"STARTER_PACK" | "CUSTOM_FORM">("STARTER_PACK");

  // Tab 1: Starter pack state
  const [selectedIndustryId, setSelectedIndustryId] = useState<string>("PHONE_SHOP");
  const [packBizName, setPackBizName] = useState(defaultBusinessName || "Apex Mobile & Electronics");
  const [packPhone, setPackPhone] = useState("(555) 234-5678");
  const [packAddress, setPackAddress] = useState("102 Technology Way, Suite 10");
  const [packCurrency, setPackCurrency] = useState(defaultCurrency.includes("USD") ? "$" : defaultCurrency);
  const [previewDocIndex, setPreviewDocIndex] = useState<number>(0);

  // Tab 2: Custom Form state
  const [customBizName, setCustomBizName] = useState(defaultBusinessName || "");
  const [customPhone, setCustomPhone] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [customHours, setCustomHours] = useState("Monday to Friday: 9:00 AM - 6:00 PM\nSaturday: 10:00 AM - 4:00 PM\nSunday: Closed");
  const [customServices, setCustomServices] = useState(
    "## Services & Products\n- Standard Consultation / Service: $50.00\n- Comprehensive Package: $120.00\n- Express Add-on: $25.00"
  );
  const [customPolicies, setCustomPolicies] = useState(
    "## Cancellations & Refunds\n- 24-hour advance notice required for cancellations.\n- Returns accepted within 14 days with original receipt."
  );
  const [customFaqs, setCustomFaqs] = useState(
    "Q: What payment methods do you accept?\nA: We accept Visa, Mastercard, Apple Pay, Google Pay, and Cash."
  );

  // Submission / Loading state
  const [targetKbId, setTargetKbId] = useState<string>("NEW");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; stepText: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Synchronize when defaultBusinessName changes
  React.useEffect(() => {
    if (defaultBusinessName) {
      setPackBizName(defaultBusinessName);
      setCustomBizName(defaultBusinessName);
    }
  }, [defaultBusinessName]);

  const selectedPack =
    INDUSTRY_STARTER_PACKS.find((p) => p.id === selectedIndustryId) || INDUSTRY_STARTER_PACKS[0];

  const generatedPackDocs: BusinessTemplateDoc[] = selectedPack.documents({
    name: packBizName.trim() || selectedPack.defaultName,
    phone: packPhone.trim(),
    address: packAddress.trim(),
    currency: packCurrency.trim() || "$",
  });

  // Handle saving docs sequentially to ensure proper ingestion
  const uploadDocumentsToKb = async (kbId: string, docs: BusinessTemplateDoc[]) => {
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      setUploadProgress({
        current: i + 1,
        total: docs.length,
        stepText: `Saving and indexing: ${doc.title}...`,
      });

      const formData = new FormData();
      formData.append("title", doc.title);
      formData.append("sourceType", "TEXT");
      formData.append("content", doc.content);

      await apiClient.post(`/knowledge-bases/${kbId}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
  };

  const handleLaunchStarterPack = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      let kbId = targetKbId;

      // 1. Create KB if NEW
      if (kbId === "NEW") {
        setUploadProgress({ current: 0, total: generatedPackDocs.length, stepText: "Creating document collection..." });
        const kbName = `${packBizName.trim() || selectedPack.defaultName} - Knowledge Base`;
        const res = await apiClient.post<KnowledgeBase>("/knowledge-bases", {
          name: kbName,
          description: `Official business information, pricing, hours, and policies for ${packBizName || selectedPack.name}.`,
        });
        kbId = res.data.id;
      }

      // 2. Upload and index all documents
      await uploadDocumentsToKb(kbId, generatedPackDocs);

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      await queryClient.invalidateQueries({ queryKey: ["documents", kbId] });

      setIsComplete(true);
      setTimeout(() => {
        setIsComplete(false);
        setIsSubmitting(false);
        setUploadProgress(null);
        onSuccess();
        onClose();
      }, 1400);
    } catch (err) {
      console.error("Failed to deploy starter documents:", err);
      setErrorMessage("An error occurred while creating your business documents. Please try again.");
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleLaunchCustomForm = async () => {
    if (!customBizName.trim()) {
      setErrorMessage("Business name is required.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const docs = compileCustomBusinessDocs({
        businessName: customBizName,
        phone: customPhone,
        email: customEmail,
        address: customAddress,
        hours: customHours,
        services: customServices,
        policies: customPolicies,
        faqs: customFaqs,
        currency: defaultCurrency.includes("USD") ? "$" : defaultCurrency,
      });

      let kbId = targetKbId;

      if (kbId === "NEW") {
        setUploadProgress({ current: 0, total: docs.length, stepText: "Creating document collection..." });
        const kbName = `${customBizName.trim()} - Knowledge Base`;
        const res = await apiClient.post<KnowledgeBase>("/knowledge-bases", {
          name: kbName,
          description: `Official business information, pricing, hours, and policies for ${customBizName}.`,
        });
        kbId = res.data.id;
      }

      await uploadDocumentsToKb(kbId, docs);

      await queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      await queryClient.invalidateQueries({ queryKey: ["documents", kbId] });

      setIsComplete(true);
      setTimeout(() => {
        setIsComplete(false);
        setIsSubmitting(false);
        setUploadProgress(null);
        onSuccess();
        onClose();
      }, 1400);
    } catch (err) {
      console.error("Failed to deploy custom business documents:", err);
      setErrorMessage("An error occurred while creating your business documents. Please try again.");
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Easy Business Setup & Document Templates"
      description="Equip your AI employees with ready-to-answer knowledge about your hours, prices, services, and policies."
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Method Switcher Tabs */}
        <div className="flex border-b border-line">
          <button
            type="button"
            onClick={() => setActiveTab("STARTER_PACK")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === "STARTER_PACK"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            1-Click Industry Starter Pack (Fastest)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CUSTOM_FORM")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === "CUSTOM_FORM"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            }`}
          >
            <FileText className="h-4 w-4" />
            Guided Fill-in-the-Blanks Setup
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-status-critical/20 bg-status-critical/10 p-3 text-xs text-status-critical">
            {errorMessage}
          </div>
        )}

        {/* ================= TAB 1: STARTER PACKS ================= */}
        {activeTab === "STARTER_PACK" && (
          <div className="space-y-6">
            {/* Step A: Select Industry */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-ink-primary uppercase tracking-wider">
                1. Select Your Business Industry
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {INDUSTRY_STARTER_PACKS.map((pack) => {
                  const Icon = INDUSTRY_ICONS[pack.id] || Store;
                  const isSelected = selectedIndustryId === pack.id;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => {
                        setSelectedIndustryId(pack.id);
                        if (!defaultBusinessName) {
                          setPackBizName(pack.defaultName);
                        }
                      }}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-brand-600 bg-brand-50/60 ring-2 ring-brand-500/20 shadow-xs"
                          : "border-line bg-white hover:border-slate-300 hover:bg-surface-page"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border mb-2 ${
                          isSelected
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-surface-page text-ink-secondary border-line"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold text-ink-primary line-clamp-1">{pack.name}</span>
                      <span className="text-[10px] text-ink-muted mt-0.5 line-clamp-1">{pack.category}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step B: Business Details */}
            <div className="rounded-2xl border border-line bg-surface-page/50 p-4 space-y-3">
              <label className="text-xs font-bold text-ink-primary uppercase tracking-wider block">
                2. Confirm Your Business Details
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Business Name"
                  value={packBizName}
                  onChange={(e) => setPackBizName(e.target.value)}
                  placeholder="e.g. Apex Mobile"
                  required
                />
                <Input
                  label="Phone / WhatsApp"
                  value={packPhone}
                  onChange={(e) => setPackPhone(e.target.value)}
                  placeholder="e.g. (555) 019-2834"
                />
                <Input
                  label="Address / City"
                  value={packAddress}
                  onChange={(e) => setPackAddress(e.target.value)}
                  placeholder="e.g. 102 Technology Way"
                />
              </div>
            </div>

            {/* Step C: Document Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink-primary uppercase tracking-wider">
                  3. Documents Included in this Starter Pack ({generatedPackDocs.length})
                </label>
                <span className="text-[11px] text-brand-600 font-medium">
                  Editable anytime after setup
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {generatedPackDocs.map((doc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPreviewDocIndex(idx)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      previewDocIndex === idx
                        ? "border-brand-600 bg-white ring-2 ring-brand-500/10 shadow-xs"
                        : "border-line bg-white/70 hover:bg-white"
                    }`}
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                      {idx === 0 ? (
                        <FileText className="h-3.5 w-3.5" />
                      ) : idx === 1 ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <HelpCircle className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-ink-primary truncate">{doc.title}</div>
                      <div className="text-[10px] text-ink-secondary mt-0.5">
                        {doc.content.split("\n").filter(Boolean).length} sections of knowledge
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Preview Box */}
              <div className="rounded-xl border border-line bg-slate-900 text-slate-100 p-4 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {generatedPackDocs[previewDocIndex]?.content}
              </div>
            </div>

            {/* Target Collection Selector */}
            {existingKnowledgeBases.length > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-xs">
                <span className="font-bold text-ink-primary shrink-0">Destination:</span>
                <select
                  value={targetKbId}
                  onChange={(e) => setTargetKbId(e.target.value)}
                  className="rounded-lg border border-line bg-surface-page px-2.5 py-1.5 text-xs text-ink-primary focus:outline-none"
                >
                  <option value="NEW">+ Create New Collection ({packBizName} Knowledge Base)</option>
                  {existingKnowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      Add to existing: {kb.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Progress or Submit */}
            {uploadProgress ? (
              <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-brand-900">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 animate-spin text-brand-600" />
                    <span>{uploadProgress.stepText}</span>
                  </div>
                  <span>
                    {uploadProgress.current} / {uploadProgress.total}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-brand-200 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 transition-all duration-300"
                    style={{
                      width: `${(uploadProgress.current / Math.max(uploadProgress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : isComplete ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-xs font-bold">
                <Check className="h-4 w-4 text-emerald-600" /> All documents created and indexed successfully!
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-line">
                <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleLaunchStarterPack}
                  isLoading={isSubmitting}
                  className="gap-2 font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-xs"
                >
                  <Sparkles className="h-4 w-4" />
                  Create Starter Knowledge Base ({generatedPackDocs.length} Docs)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: GUIDED FORM ================= */}
        {activeTab === "CUSTOM_FORM" && (
          <div className="space-y-4">
            <p className="text-xs text-ink-secondary">
              Fill in your business details below. We will automatically format and structure them into professional documents for your AI employees.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Business Name"
                value={customBizName}
                onChange={(e) => setCustomBizName(e.target.value)}
                placeholder="e.g. Acme Studio"
                required
              />
              <Input
                label="Phone Number"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="e.g. (555) 123-4567"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Email Address"
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="e.g. info@acmestudio.com"
              />
              <Input
                label="Physical Address & Parking"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                placeholder="e.g. 100 Main St, Suite 500 (Free parking on rear)"
              />
            </div>

            <Textarea
              label="Operating Hours"
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              rows={3}
              placeholder="e.g. Monday to Friday: 9am-6pm, Saturday: 10am-4pm, Sunday: Closed"
            />

            <Textarea
              label="Key Services, Products & Pricing (What can customers buy or book?)"
              value={customServices}
              onChange={(e) => setCustomServices(e.target.value)}
              rows={4}
              placeholder="e.g. Haircut: $45 (30 mins), Color Treatment: $95 (60 mins)"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Textarea
                label="Return, Refund & Cancellation Policies"
                value={customPolicies}
                onChange={(e) => setCustomPolicies(e.target.value)}
                rows={3}
                placeholder="e.g. Cancellations require 24h advance notice. Returns within 14 days."
              />
              <Textarea
                label="Frequently Asked Questions (FAQ)"
                value={customFaqs}
                onChange={(e) => setCustomFaqs(e.target.value)}
                rows={3}
                placeholder="Q: Do you accept walk-ins? A: Yes, but appointments are recommended."
              />
            </div>

            {/* Target Collection Selector */}
            {existingKnowledgeBases.length > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-xs">
                <span className="font-bold text-ink-primary shrink-0">Destination:</span>
                <select
                  value={targetKbId}
                  onChange={(e) => setTargetKbId(e.target.value)}
                  className="rounded-lg border border-line bg-surface-page px-2.5 py-1.5 text-xs text-ink-primary focus:outline-none"
                >
                  <option value="NEW">+ Create New Collection ({customBizName || "Business"} Knowledge Base)</option>
                  {existingKnowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      Add to existing: {kb.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Progress or Submit */}
            {uploadProgress ? (
              <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-brand-900">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 animate-spin text-brand-600" />
                    <span>{uploadProgress.stepText}</span>
                  </div>
                  <span>
                    {uploadProgress.current} / {uploadProgress.total}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-brand-200 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 transition-all duration-300"
                    style={{
                      width: `${(uploadProgress.current / Math.max(uploadProgress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : isComplete ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-xs font-bold">
                <Check className="h-4 w-4 text-emerald-600" /> All documents compiled and indexed successfully!
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-line">
                <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleLaunchCustomForm}
                  isLoading={isSubmitting}
                  className="gap-2 font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-xs"
                >
                  <FileText className="h-4 w-4" />
                  Generate &amp; Save My Business Documents
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
