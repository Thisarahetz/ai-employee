"use client";

import { useState, type FormEvent } from "react";
import { Sparkles, FileText, Check } from "lucide-react";
import { useUploadDocument } from "@/lib/hooks/use-knowledge-bases";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import type { DocumentSourceType } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INDIVIDUAL_DOC_TEMPLATES, hasUnfilledExample } from "@/lib/knowledge-base-templates";

const SOURCE_TYPES: DocumentSourceType[] = ["PDF", "DOCX", "TEXT", "FAQ", "URL"];

export function UploadDocumentForm({
  knowledgeBaseId,
  onDone,
  initialTemplateId,
}: {
  knowledgeBaseId: string;
  onDone: () => void;
  initialTemplateId?: string;
}) {
  const uploadDocument = useUploadDocument(knowledgeBaseId);
  const { data: businesses } = useBusinesses();
  const currentBiz = businesses?.[0];
  const bizName = currentBiz?.name || "Our Business";

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplateId || "");
  const [templateLoadedNotice, setTemplateLoadedNotice] = useState(false);

  const initialTemplate = initialTemplateId
    ? INDIVIDUAL_DOC_TEMPLATES.find((t) => t.id === initialTemplateId)
    : null;

  const [title, setTitle] = useState(initialTemplate ? `${bizName} - ${initialTemplate.title}` : "");
  const [sourceType, setSourceType] = useState<DocumentSourceType>(initialTemplate ? "TEXT" : "PDF");
  const [file, setFile] = useState<File | null>(null);
  const [textValue, setTextValue] = useState(
    initialTemplate
      ? initialTemplate.generateContent({
          name: bizName,
          phone: "(555) 123-4567",
          address: "123 Business Avenue, Suite 100",
          currency: "$",
        })
      : ""
  );
  const [error, setError] = useState<string | null>(null);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const t = INDIVIDUAL_DOC_TEMPLATES.find((item) => item.id === templateId);
    if (t) {
      setTitle(`${bizName} - ${t.title}`);
      setSourceType("TEXT");
      setTextValue(
        t.generateContent({
          name: bizName,
          phone: "(555) 123-4567",
          address: "123 Business Avenue, Suite 100",
          currency: "$",
        })
      );
      setTemplateLoadedNotice(true);
      setTimeout(() => setTemplateLoadedNotice(false), 3500);
    }
  };

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
    if (needsContent && hasUnfilledExample(textValue)) {
      setError("This template still has example details. Replace them with this business's real information, fill every [ADD …] blank, and delete the EXAMPLE line.");
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-line bg-surface-page p-5">
      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

      {/* Quick Template Selector */}
      <div className="rounded-xl border border-brand-200/80 bg-brand-50/50 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            Quick Setup: Insert Ready-Made Template
          </label>
          <span className="text-[11px] text-brand-700">Pre-formats document for AI</span>
        </div>

        <select
          value={selectedTemplateId}
          onChange={(e) => handleSelectTemplate(e.target.value)}
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-ink-primary focus:border-brand-500 focus:outline-none"
        >
          <option value="">-- Choose a standard template to insert --</option>
          {INDIVIDUAL_DOC_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.category})
            </option>
          ))}
        </select>

        {templateLoadedNotice && (
          <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 animate-in fade-in">
            <Check className="h-3.5 w-3.5 text-emerald-600" /> Template loaded below! Customize the text and pricing to match your business.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <Input label="Document Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Services & Pricing Menu" />
        </div>
        <div>
          <Select label="Source Type" value={sourceType} onChange={(e) => setSourceType(e.target.value as DocumentSourceType)}>
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {needsFile && (
        <div>
          <label className="mb-1.5 block text-xs font-bold text-ink-primary">File (PDF or Word Document)</label>
          <input
            type="file"
            accept={sourceType === "PDF" ? ".pdf" : ".doc,.docx"}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-ink-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-brand-700 cursor-pointer"
          />
        </div>
      )}

      {needsUrl && (
        <Input label="Webpage URL" type="url" value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="https://yourwebsite.com/pricing" />
      )}

      {needsContent && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink-primary">
              Document Content (Markdown / Text)
            </label>
            <span className="text-[10px] text-ink-muted">AI employees read this to answer questions</span>
          </div>
          <Textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            rows={8}
            placeholder="Paste your menu, product list, opening hours, or FAQ here..."
            className="font-mono text-xs leading-relaxed"
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-line">
        <Button type="submit" size="sm" isLoading={uploadDocument.isPending} className="font-bold">
          <FileText className="h-3.5 w-3.5 mr-1" />
          Save &amp; Ingest Document
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
