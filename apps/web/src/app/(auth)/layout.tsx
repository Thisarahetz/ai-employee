import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
            AI
          </div>
          <h1 className="text-xl font-semibold text-ink-primary">AI Employee</h1>
          <p className="mt-1 text-sm text-ink-secondary">Multi-tenant AI support &amp; automation platform</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
