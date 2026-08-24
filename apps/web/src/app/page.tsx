"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root route: always send visitors into the dashboard shell. The
 * `(dashboard)/layout.tsx` guard redirects to /login when unauthenticated,
 * so this stays a single, simple hop regardless of auth state.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return null;
}
