import type { Metadata } from "next";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Employee",
  description: "Multi-tenant AI Employee admin dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface-page text-ink-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
