import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";

import { ThemeProvider } from "@/context/ThemeContext";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-1 bg-white p-6 dark:bg-gray-900 sm:p-0">
      <ThemeProvider>
        <div className="relative flex h-screen w-full flex-col justify-center lg:flex-row dark:bg-gray-900 sm:p-0">
          {children}
          <div className="relative hidden h-full w-full items-center overflow-hidden bg-linear-to-br from-brand-900 via-brand-950 to-gray-950 lg:grid lg:w-1/2">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,rgba(95,185,112,0.22),transparent_55%)]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl"
              aria-hidden
            />
            <GridShape />
            <div className="relative z-10 flex max-w-md flex-col items-center px-10 text-center">
              <Link href="/" className="mb-8 block">
                <Image
                  width={220}
                  height={60}
                  src="/logo/call-a-doctor.png"
                  alt="Call a Doctor"
                  className="mx-auto w-[220px] object-contain drop-shadow-md"
                />
              </Link>
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Care that fits your clinic
              </h2>
              <p className="mt-4 text-pretty text-base leading-relaxed text-brand-100/90">
                Appointments, patients, lab, pharmacy, and finances — one calm workspace for your team.
              </p>
              <ul className="mt-10 space-y-3 text-left text-sm text-white/85">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/40 text-xs font-bold text-brand-100">
                    ✓
                  </span>
                  <span>Secure access for staff with role-based permissions</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/40 text-xs font-bold text-brand-100">
                    ✓
                  </span>
                  <span>Real-time patient records and prescription workflows</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/40 text-xs font-bold text-brand-100">
                    ✓
                  </span>
                  <span>Pharmacy POS and inventory tied to your branches</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
