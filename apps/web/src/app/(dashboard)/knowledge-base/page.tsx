"use client";

import { useState, type FormEvent } from "react";

import { useCreateKnowledgeBase, useKnowledgeBases } from "@/lib/hooks/use-knowledge-bases";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { KnowledgeBaseCard } from "@/components/knowledge-base/kb-card";

export default function KnowledgeBasePage() {
  const knowledgeBasesQuery = useKnowledgeBases();
  const createKnowledgeBase = useCreateKnowledgeBase();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">Business Information &amp; Documents</h1>
          <p className="text-xs text-ink-secondary mt-1 max-w-2xl">
            Give your AI employees information about your business (Price Lists, Service Menus, FAQs, Policies, Product Catalogs).
            They will use this information when answering customer questions.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen((v) => !v)} className="shrink-0 text-xs font-bold">
          {isCreateOpen ? "Close" : "+ Add Document Collection"}
        </Button>
      </div>

      {isCreateOpen && (
        <Card>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Textarea
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
              <Button type="submit" isLoading={createKnowledgeBase.isPending}>
                Create
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {knowledgeBasesQuery.isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      ) : knowledgeBasesQuery.isError ? (
        <ErrorState
          message={getErrorMessage(knowledgeBasesQuery.error, "Unable to load knowledge bases.")}
          onRetry={() => knowledgeBasesQuery.refetch()}
        />
      ) : !knowledgeBasesQuery.data?.length ? (
        <EmptyState
          title="No knowledge bases yet"
          description="Create one to start uploading documents the AI can answer questions from."
        />
      ) : (
        <div className="space-y-4">
          {knowledgeBasesQuery.data.map((kb) => (
            <KnowledgeBaseCard key={kb.id} knowledgeBase={kb} />
          ))}
        </div>
      )}
    </div>
  );
}
