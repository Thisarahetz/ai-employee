import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent", className)}
      aria-hidden="true"
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
