"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Dynamic import with SSR disabled ensures smooth canvas DOM initialization
const WorkflowCanvas = dynamic(
  () =>
    import("@/components/workflow-builder/workflow-canvas").then(
      (mod) => mod.WorkflowCanvas
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-6.5rem)] w-full items-center justify-center rounded-xl border border-line bg-white shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-xs font-semibold text-ink-secondary">
            Loading Visual Canvas...
          </span>
        </div>
      </div>
    ),
  }
);

export default function WorkflowBuilderPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/workflows"
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Workflows
          </Link>
          <span className="text-line">|</span>
          <h1 className="text-lg font-bold text-ink-primary">Visual Workflow Builder</h1>
        </div>
      </div>

      <WorkflowCanvas />
    </div>
  );
}
