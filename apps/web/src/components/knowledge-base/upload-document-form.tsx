"use client";

import { useState, type FormEvent } from "react";

import { useUploadDocument } from "@/lib/hooks/use-knowledge-bases";
import type { DocumentSourceType } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SOURCE_TYPES: DocumentSourceType[] = ["PDF", "DOCX", "TEXT", "FAQ", "URL"];

/**
 * The contract only specifies "multipart upload on POST" for
 * /knowledge-bases/:id/documents — the exact field names for non-file
 * source types (TEXT/FAQ/URL) aren't documented, so this form sends a best
 * guess (`file` | `content` | `url`) alongside `title` and `sourceType` as
 * multipart fields. Adjust field names here once confirmed with the backend.
 */
export function UploadDocumentForm({ knowledgeBaseId, onDone }: { knowledgeBaseId: string; onDone: () => void }) {
  const uploadDocument = useUploadDocument(knowledgeBaseId);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<DocumentSourceType>("PDF");
  const [file, setFile] = useState<File | null>(null);
  const [textValue, setTextValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const needsFile = sourceType === "PDF" || sourceType === "DOCX";
  const needsUrl = sourceType === "URL";
  const needsContent = sourceType === "TEXT" || sourceType === "FAQ";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (needsFile && !file) {
      setError("Please choose a file to upload.");
      return;
    }
    if ((needsUrl || needsContent) && !textValue.trim()) {
      setError(needsUrl ? "URL is required." : "Content is required.");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("sourceType", sourceType);
    if (needsFile && file) formData.append("file", file);
    if (needsUrl) formData.append("url", textValue);
    if (needsContent) formData.append("content", textValue);

    try {
      await uploadDocument.mutateAsync(formData);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Could not upload the document."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-line bg-surface-page p-4">
      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />

      <Select label="Source type" value={sourceType} onChange={(e) => setSourceType(e.target.value as DocumentSourceType)}>
        {SOURCE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </Select>

      {needsFile && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-primary">File</label>
          <input
            type="file"
            accept={sourceType === "PDF" ? ".pdf" : ".doc,.docx"}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
        </div>
      )}

      {needsUrl && <Input label="URL" type="url" value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="https://" />}

      {needsContent && <Textarea label="Content" value={textValue} onChange={(e) => setTextValue(e.target.value)} rows={5} />}

      <div className="flex gap-2">
        <Button type="submit" size="sm" isLoading={uploadDocument.isPending}>
          Upload
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
