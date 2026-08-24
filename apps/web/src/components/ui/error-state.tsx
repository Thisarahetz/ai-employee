export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-status-critical/30 bg-status-critical/5 px-6 py-8 text-center">
      <p className="text-sm font-medium text-status-critical">{message ?? "Something went wrong."}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-medium text-brand-600 hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
