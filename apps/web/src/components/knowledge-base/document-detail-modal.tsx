"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { documentStatusStyles } from "@/lib/status-styles";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { useDocument, useUpdateDocument, useDeleteDocument } from "@/lib/hooks/use-knowledge-bases";

interface DocumentDetailModalProps {
  knowledgeBaseId: string;
  documentId: string | null;
  onClose: () => void;
}

export function DocumentDetailModal({
  knowledgeBaseId,
  documentId,
  onClose,
}: DocumentDetailModalProps) {
  const documentQuery = useDocument(knowledgeBaseId, documentId ?? undefined);
  const updateDocument = useUpdateDocument(knowledgeBaseId);
  const deleteDocument = useDeleteDocument(knowledgeBaseId);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (documentQuery.data) {
      setTitle(documentQuery.data.title || "");
      setContent(documentQuery.data.content || "");
    }
  }, [documentQuery.data]);

  const doc = documentQuery.data;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!documentId) return;
    setError(null);
    setSuccess(null);

    try {
      await updateDocument.mutateAsync({
        documentId,
        data: { title, content },
      });
      setSuccess("Document updated and re-indexed successfully!");
      setIsEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update document."));
    }
  }

  async function handleDelete() {
    if (!documentId || !confirm("Are you sure you want to delete this document and all its embedded chunks?")) {
      return;
    }
    try {
      await deleteDocument.mutateAsync(documentId);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete document."));
    }
  }

  return (
    <Modal
      isOpen={!!documentId}
      onClose={onClose}
      title={doc?.title || "Document Details"}
      description={`Source: ${doc?.sourceType || "TEXT"} · Added: ${doc ? formatDate(doc.createdAt) : ""}`}
      maxWidth="max-w-3xl"
    >
      {documentQuery.isLoading ? (
        <div className="space-y-4 py-6">
          <div className="h-6 w-1/3 animate-pulse rounded bg-surface-page" />
          <div className="h-40 animate-pulse rounded bg-surface-page" />
        </div>
      ) : !doc ? (
        <p className="text-sm text-ink-muted">Document not found.</p>
      ) : (
        <div className="space-y-6">
          {error && (
            <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md bg-status-success/10 px-3 py-2 text-sm text-status-success">
              {success}
            </p>
          )}

          {/* Status & Metadata Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-page p-3 border border-line">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-ink-secondary">Status:</span>
              <StatusBadge {...documentStatusStyles[doc.status]} />
              {doc.chunks && (
                <span className="text-xs text-ink-muted">
                  {doc.chunks.length} {doc.chunks.length === 1 ? "chunk" : "chunks"} indexed
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>
                  Edit Content ✏️
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-status-critical hover:bg-status-critical/10"
                isLoading={deleteDocument.isPending}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          </div>

          {/* Document Form or View */}
          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <Input
                label="Document Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <Textarea
                label="Document Text Content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                placeholder="Enter document text content here..."
                required
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={updateDocument.isPending}>
                  Save & Re-Index
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Content Preview
                </h4>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-surface-page p-4 text-xs font-mono text-ink-primary whitespace-pre-wrap">
                  {doc.content || "No raw text content available."}
                </div>
              </div>

              {/* Chunks View */}
              {doc.chunks && doc.chunks.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Indexed Vector Chunks ({doc.chunks.length})
                  </h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {doc.chunks.map((chunk, idx) => (
                      <div
                        key={chunk.id}
                        className="rounded-md border border-line bg-white p-3 text-xs shadow-xs"
                      >
                        <div className="mb-1 flex items-center justify-between text-[11px] text-ink-muted">
                          <span className="font-semibold text-ink-secondary">Chunk #{idx + 1}</span>
                          <span>~{chunk.tokenCount} tokens</span>
                        </div>
                        <p className="text-ink-primary whitespace-pre-wrap">{chunk.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
