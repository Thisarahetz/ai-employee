"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Phone navigation. The sidebar is hidden below the `sm` breakpoint, so the top
 * bar shows a menu button that opens the same sidebar content as a drawer.
 */
interface MobileNavState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const MobileNavContext = createContext<MobileNavState>({ isOpen: false, open: () => {}, close: () => {} });

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const pathname = usePathname();

  // Picking a page closes the drawer.
  useEffect(() => setIsOpen(false), [pathname]);

  return <MobileNavContext.Provider value={{ isOpen, open, close }}>{children}</MobileNavContext.Provider>;
}

export const useMobileNav = () => useContext(MobileNavContext);

/** Top-bar button, visible on phones only. */
export function MobileMenuButton({ label = "Open menu" }: { label?: string }) {
  const { open, isOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={open}
      aria-label={label}
      aria-expanded={isOpen}
      className="-ml-1 mr-2 rounded-lg p-2 text-ink-secondary hover:bg-surface-page sm:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

/** Wraps sidebar content: a fixed column on larger screens, a drawer on phones. */
export function ResponsiveSidebar({
  className,
  label = "Main menu",
  closeLabel = "Close menu",
  children,
}: {
  className: string;
  label?: string;
  closeLabel?: string;
  children: ReactNode;
}) {
  const { isOpen, close } = useMobileNav();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, close]);

  return (
    <>
      <aside className={cn("hidden sm:flex", className)}>{children}</aside>
      {isOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <aside className={cn("relative flex h-full max-w-[85vw] overflow-y-auto shadow-xl", className)}>
            <button
              type="button"
              onClick={close}
              aria-label={closeLabel}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-ink-muted hover:bg-surface-page"
            >
              <X className="h-4 w-4" />
            </button>
            {children}
          </aside>
        </div>
      )}
    </>
  );
}
