"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import AdminAuthGuard from "@/components/auth/AdminAuthGuard";
import { ExpirySoonProvider } from "@/context/ExpirySoonContext";
import { usePathname } from "next/navigation";
import React from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = pathname === "/appointments";
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  // Dynamic class for main content margin based on sidebar state
  const mainContentMargin = hideSidebar
    ? "ml-0"
    : isMobileOpen
      ? "ml-0"
      : isExpanded || isHovered
        ? "lg:ml-[260px]"
        : "lg:ml-[90px]";

  return (
    <AdminAuthGuard>
      <ExpirySoonProvider>
      <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden xl:flex-row">
        {/* Sidebar and Backdrop — hidden on full-width calendar */}
        {!hideSidebar && <AppSidebar />}
        {!hideSidebar && <Backdrop />}
        {/* Main Content Area — flex column fills viewport under header so nested panes can scroll */}
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out ${mainContentMargin}`}
        >
          {/* Header */}
          <AppHeader />
          {/* Page Content */}
          <div
            className={
              hideSidebar
                ? "flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-3 sm:px-3 md:px-4 md:py-4"
                : "mx-auto max-w-(--breakpoint-2xl) min-h-0 w-full flex-1 overflow-y-auto p-4 md:p-6"
            }
          >
            {children}
          </div>
        </div>
      </div>
      </ExpirySoonProvider>
    </AdminAuthGuard>
  );
}
