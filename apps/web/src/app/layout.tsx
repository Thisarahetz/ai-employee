import type { Metadata } from "next";
import { Noto_Sans_Sinhala } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Consistent Sinhala rendering on every OS (used only for Sinhala characters).
const sinhala = Noto_Sans_Sinhala({ subsets: ["sinhala"], variable: "--font-sinhala", display: "swap" });

export const metadata: Metadata = {
  title: "AI Employee",
  description: "Multi-tenant AI Employee admin dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sinhala.variable}>
      <body className="bg-surface-page text-ink-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
