import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";

import { ThemeProvider } from "@/context/ThemeContext";
import React from "react";

/**
 * Single-column auth shell: the form sits centred on the page at every breakpoint.
 * Background washes live here rather than in the forms so they cover the whole viewport.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div className="relative min-h-screen overflow-hidden bg-white dark:bg-gray-900">
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-br from-gray-50 via-brand-50/50 to-blue-light-50/40 dark:from-gray-950 dark:via-gray-900 dark:to-brand-950/40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-[26rem] w-[26rem] rounded-full bg-brand-300/25 blur-3xl dark:bg-brand-500/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-[22rem] w-[22rem] rounded-full bg-blue-light-300/20 blur-3xl dark:bg-blue-light-600/10"
          aria-hidden
        />

        <main className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
          {children}
        </main>

        <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </ThemeProvider>
  );
}
