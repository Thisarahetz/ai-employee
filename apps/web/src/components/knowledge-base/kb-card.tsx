"use client";

import { useState } from "react";

import { useDeleteDocument, useDeleteKnowledgeBase, useDocuments, useUpdateKnowledgeBase } from "@/lib/hooks/use-knowledge-bases";
import type { KnowledgeBase } from "@/lib/types";
import { documentStatusStyles } from "@/lib/status-styles";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Sparkles } from "lucide-react";
import { UploadDocumentForm } from "./upload-document-form";
import { DocumentDetailModal } from "./document-detail-modal";

export function KnowledgeBaseCard({ knowledgeBase }: { knowledgeBase: KnowledgeBase }) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditingKb, setIsEditingKb] = useState(false);
  const [kbName, setKbName] = useState(knowledgeBase.name);
  const [kbDescription, setKbDescription] = useState(knowledgeBase.description || "");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [kbError, setKbError] = useState<string | null>(null);

  const documentsQuery = useDocuments(knowledgeBase.id);
  const updateKnowledgeBase = useUpdateKnowledgeBase(knowledgeBase.id);
  const deleteKnowledgeBase = useDeleteKnowledgeBase();
  const deleteDocument = useDeleteDocument(knowledgeBase.id);

  async function handleSaveKb(e: React.FormEvent) {
    e.preventDefault();
    if (!kbName.trim()) return;
    setKbError(null);
    try {
      await updateKnowledgeBase.mutateAsync({
        name: kbName,
        description: kbDescription || undefined,
      });
      setIsEditingKb(false);
    } catch (err) {
      setKbError(getErrorMessage(err, "Could not update knowledge base."));
    }
  }

  async function handleDeleteKb() {
    if (!confirm(`Are you sure you want to delete "${knowledgeBase.name}" and all its documents?`)) {
      return;
    }
    try {
      await deleteKnowledgeBase.mutateAsync(knowledgeBase.id);
    } catch (err) {
      setKbError(getErrorMessage(err, "Could not delete knowledge base."));
    }
  }

  async function handleDeleteDoc(docId: string, title: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete document "${title}"?`)) return;
    try {
      await deleteDocument.mutateAsync(docId);
    } catch (err) {
      alert(getErrorMessage(err, "Failed to delete document."));
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setKbName(knowledgeBase.name);
                  setKbDescription(knowledgeBase.description || "");
                  setIsEditingKb(!isEditingKb);
                }}
              >
                {isEditingKb ? "Cancel" : "Edit ✏️"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsUploadOpen((v) => !v)}
              >
                {isUploadOpen ? "Close" : "+ Add document"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-status-critical hover:bg-status-critical/10"
                isLoading={deleteKnowledgeBase.isPending}
                onClick={handleDeleteKb}
              >
                Delete
              </Button>
            </div>
          }
        >
          {!isEditingKb ? (
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>{knowledgeBase.name}</CardTitle>
                {knowledgeBase.managedBy && (
                  <span
                    className="rounded border border-line bg-surface-page px-1.5 py-0.5 text-xs font-normal text-ink-secondary"
                    title={`Documents from ${knowledgeBase.managedBy.integrationName} are kept in sync automatically and can't be edited here.`}
                  >
                    Synced · {knowledgeBase.managedBy.integrationName}
                  </span>
                )}
              </div>
              {knowledgeBase.description && <CardDescription>{knowledgeBase.description}</CardDescription>}
            </div>
          ) : (
            <div className="w-full">
              <form onSubmit={handleSaveKb} className="space-y-3 py-1">
                {kbError && <p className="text-xs text-status-critical">{kbError}</p>}
                <Input
                  label="Knowledge Base Name"
                  value={kbName}
                  onChange={(e) => setKbName(e.target.value)}
                  required
                />
                <Textarea
                  label="Description"
                  value={kbDescription}
                  onChange={(e) => setKbDescription(e.target.value)}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" isLoading={updateKnowledgeBase.isPending}>
                    Save Changes
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingKb(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isUploadOpen && (
            <UploadDocumentForm knowledgeBaseId={knowledgeBase.id} onDone={() => setIsUploadOpen(false)} />
          )}

          {documentsQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-surface-page" />
              ))}
            </div>
          ) : documentsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(documentsQuery.error, "Unable to load documents.")}
              onRetry={() => documentsQuery.refetch()}
            />
          ) : !documentsQuery.data?.length ? (
            <div className="rounded-xl border border-dashed border-line bg-surface-page/50 p-6 text-center space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink-primary">No documents in this collection yet</h4>
                <p className="text-xs text-ink-secondary mt-0.5 max-w-md mx-auto">
                  Add your price list, hours, services, or FAQs so your AI employees can answer questions accurately.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button size="sm" onClick={() => setIsUploadOpen(true)} className="text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white">
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-amber-300" /> Insert Document Template
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setIsUploadOpen(true)} className="text-xs">
                  Upload PDF or File
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                  <tr>
                    <th className="py-2.5 font-medium">Title</th>
                    <th className="py-2.5 font-medium">Source</th>
                    <th className="py-2.5 font-medium">Status</th>
                    <th className="py-2.5 font-medium">Added</th>
                    <th className="py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {documentsQuery.data.map((document) => {
                    const style = documentStatusStyles[document.status];
                    return (
                      <tr
                        key={document.id}
                        onClick={() => setSelectedDocId(document.id)}
                        className="cursor-pointer hover:bg-surface-page/70 transition-colors group"
                      >
                        <td className="py-3 pr-3 font-medium text-ink-primary">
                          <span className="group-hover:text-brand-600 transition-colors">
                            {document.title}
                          </span>
                          {document.status === "FAILED" && document.errorMessage && (
                            <p className="text-xs font-normal text-status-critical">{document.errorMessage}</p>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-xs text-ink-secondary">
                          <span className="rounded bg-surface-page px-2 py-0.5 border border-line">
                            {document.sourceType}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge {...style} />
                        </td>
                        <td className="py-3 text-xs text-ink-secondary">{formatDate(document.createdAt)}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setSelectedDocId(document.id)}
                            >
                              {document.sourceType === "INTEGRATION" ? "View 👁️" : "View / Edit 👁️"}
                            </Button>
                            {document.sourceType !== "INTEGRATION" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-status-critical hover:bg-status-critical/10"
                                onClick={(e) => handleDeleteDoc(document.id, document.title, e)}
                              >
                                ✕
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document View & Edit Modal */}
      {selectedDocId && (
        <DocumentDetailModal
          knowledgeBaseId={knowledgeBase.id}
          documentId={selectedDocId}
          onClose={() => setSelectedDocId(null)}
        />
      )}
    </>
  );
}

