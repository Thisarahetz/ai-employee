"use client";

import { useState } from "react";

import { useDocuments } from "@/lib/hooks/use-knowledge-bases";
import type { KnowledgeBase } from "@/lib/types";
import { documentStatusStyles } from "@/lib/status-styles";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { UploadDocumentForm } from "./upload-document-form";

export function KnowledgeBaseCard({ knowledgeBase }: { knowledgeBase: KnowledgeBase }) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const documentsQuery = useDocuments(knowledgeBase.id);

  return (
    <Card>
      <CardHeader
        actions={
          <Button size="sm" variant="secondary" onClick={() => setIsUploadOpen((v) => !v)}>
            {isUploadOpen ? "Close" : "+ Add document"}
          </Button>
        }
      >
        <CardTitle>{knowledgeBase.name}</CardTitle>
        {knowledgeBase.description && <CardDescription>{knowledgeBase.description}</CardDescription>}
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
          <EmptyState title="No documents yet" description="Upload a PDF, doc, URL, or plain text to build this knowledge base." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="py-1.5 font-medium">Title</th>
                <th className="py-1.5 font-medium">Source</th>
                <th className="py-1.5 font-medium">Status</th>
                <th className="py-1.5 font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {documentsQuery.data.map((document) => {
                const style = documentStatusStyles[document.status];
                return (
                  <tr key={document.id}>
                    <td className="py-2 pr-2 font-medium text-ink-primary">
                      {document.title}
                      {document.status === "FAILED" && document.errorMessage && (
                        <p className="text-xs font-normal text-status-critical">{document.errorMessage}</p>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-ink-secondary">{document.sourceType}</td>
                    <td className="py-2 pr-2">
                      <StatusBadge {...style} />
                    </td>
                    <td className="py-2 text-ink-secondary">{formatDate(document.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
