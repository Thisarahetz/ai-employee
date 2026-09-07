"use client";

import { useState, type FormEvent } from "react";
import { Sparkles, FileText, Plus, Store } from "lucide-react";
import { useCreateKnowledgeBase, useKnowledgeBases } from "@/lib/hooks/use-knowledge-bases";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { KnowledgeBaseCard } from "@/components/knowledge-base/kb-card";
import { EasySetupModal } from "@/components/knowledge-base/easy-setup-modal";

export default function KnowledgeBasePage() {
  const knowledgeBasesQuery = useKnowledgeBases();
  const createKnowledgeBase = useCreateKnowledgeBase();
  const { data: businesses } = useBusinesses();
  const currentBusiness = businesses?.[0];

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEasySetupOpen, setIsEasySetupOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      await createKnowledgeBase.mutateAsync({ name, description: description || undefined });
      setName("");
      setDescription("");
      setIsCreateOpen(false);
    } catch (err) {
      setError(getErrorMessage(err, "Could not create the knowledge base."));
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">Business Information &amp; Documents</h1>
          <p className="text-xs text-ink-secondary mt-1 max-w-2xl">
            Give your AI employees information about your business (Price Lists, Service Menus, FAQs, Policies, Product Catalogs).
            They will use this information when answering customer questions accurately.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => setIsEasySetupOpen(true)}
            className="text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-300" />
            Quick Setup &amp; Templates
          </Button>
          <Button
            variant="secondary"
            onClick={() => setIsCreateOpen((v) => !v)}
            className="text-xs font-semibold"
          >
            {isCreateOpen ? "Close" : "+ Add Collection"}
          </Button>
        </div>
      </div>

      {/* Manual Add Collection Drawer */}
      {isCreateOpen && (
        <Card>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-primary uppercase tracking-wider">
                  Create Document Collection
                </span>
                <span className="text-[11px] text-ink-muted">
                  Group related documents together
                </span>
              </div>
              {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}
              <Input label="Collection Name" placeholder="e.g. Products & Pricing, Company Policies" value={name} onChange={(e) => setName(e.target.value)} required />
              <Textarea
                label="Description (optional)"
                placeholder="What type of business info will be kept here?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" isLoading={createKnowledgeBase.isPending}>
                  Create Collection
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Main Content Area */}
      {knowledgeBasesQuery.isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-white border border-line" />
          ))}
        </div>
      ) : knowledgeBasesQuery.isError ? (
        <ErrorState
          message={getErrorMessage(knowledgeBasesQuery.error, "Unable to load knowledge bases.")}
          onRetry={() => knowledgeBasesQuery.refetch()}
        />
      ) : !knowledgeBasesQuery.data?.length ? (
        /* Zero State: Easy Setup Hero */
        <div className="rounded-3xl border border-line bg-gradient-to-b from-white via-white to-brand-50/20 p-8 shadow-xs text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
            <Sparkles className="h-7 w-7" />
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <h2 className="text-xl font-bold text-ink-primary">
              Set Up Your Business Knowledge in 60 Seconds
            </h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Your AI employees need your price lists, opening hours, services, and policies to answer customer questions accurately. Choose an easy setup method below:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
            <div
              onClick={() => setIsEasySetupOpen(true)}
              className="cursor-pointer rounded-2xl border border-brand-200 bg-white p-5 hover:border-brand-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-0.5 text-[10px] font-bold">
                  Recommended · 10 Sec
                </span>
              </div>
              <h3 className="text-sm font-bold text-ink-primary">1-Click Industry Starter Pack</h3>
              <p className="text-xs text-ink-secondary mt-1">
                Pre-crafted documents for Salon &amp; Spa, Phone Shop, Restaurant, Clinic, Grocery, Garage &amp; Retail.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-bold text-brand-600 group-hover:translate-x-1 transition-transform">
                Launch Industry Starter Pack →
              </div>
            </div>

            <div
              onClick={() => setIsEasySetupOpen(true)}
              className="cursor-pointer rounded-2xl border border-line bg-white p-5 hover:border-brand-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-page text-ink-secondary group-hover:bg-brand-600 group-hover:text-white transition-colors">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-[10px] font-bold">
                  Guided Form
                </span>
              </div>
              <h3 className="text-sm font-bold text-ink-primary">Easy Fill-in-the-Blanks</h3>
              <p className="text-xs text-ink-secondary mt-1">
                Enter your hours, contact info, services with prices, and return policy. We compile everything for your AI.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-bold text-brand-600 group-hover:translate-x-1 transition-transform">
                Fill Business Details →
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="text-xs text-ink-muted hover:text-ink-primary underline underline-offset-4"
            >
              Or create an empty collection manually
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Helper Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-brand-200/80 bg-brand-50/40 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-ink-primary">Need more business documents or price lists?</h3>
                <p className="text-[11px] text-ink-secondary">
                  Use our templates to generate Opening Hours, Pricing Menus, FAQs, or Refund Policies in seconds.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setIsEasySetupOpen(true)}
              className="shrink-0 text-xs font-bold bg-white text-brand-700 border border-brand-300 hover:bg-brand-50"
            >
              Browse Starter Templates
            </Button>
          </div>

          {/* Existing Knowledge Bases */}
          <div className="space-y-4">
            {knowledgeBasesQuery.data.map((kb) => (
              <KnowledgeBaseCard key={kb.id} knowledgeBase={kb} />
            ))}
          </div>
        </div>
      )}

      {/* Easy Setup Modal */}
      <EasySetupModal
        isOpen={isEasySetupOpen}
        onClose={() => setIsEasySetupOpen(false)}
        onSuccess={() => {
          knowledgeBasesQuery.refetch();
        }}
        existingKnowledgeBases={knowledgeBasesQuery.data || []}
        defaultBusinessName={currentBusiness?.name || ""}
      />
    </div>
  );
}
