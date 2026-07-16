"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLayoutStore } from "@/stores/layoutStore";
import Sidebar from "@/components/layout/Sidebar";
import MobileDrawer from "@/components/layout/MobileDrawer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const setActiveWorkspace = useLayoutStore(
    (state) => state.setActiveWorkspace,
  );
  const pushNavigationHistory = useLayoutStore(
    (state) => state.pushNavigationHistory,
  );

  useEffect(() => {
    if (!pathname) return;

    // Map pathname to workspace key
    let workspace = "dashboard";
    if (pathname === "/dashboard/generator") {
      workspace = "sop-generator";
    } else if (pathname === "/dashboard/components") {
      workspace = "components";
    } else if (pathname === "/dashboard/history") {
      workspace = "history";
    } else if (pathname === "/dashboard/templates") {
      workspace = "templates";
    } else if (pathname === "/dashboard/settings") {
      workspace = "settings";
    } else if (pathname.startsWith("/dashboard/")) {
      workspace = "dashboard";
    }

    setActiveWorkspace(workspace);
    pushNavigationHistory(pathname);
  }, [pathname, setActiveWorkspace, pushNavigationHistory]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans relative">
      {/* Sidebar for desktop */}
      <Sidebar />

      {/* Mobile Drawer for small screens (includes hamburger trigger) */}
      <MobileDrawer />

      {/* Main Content Area */}
      <div className="flex-1 h-screen overflow-y-auto flex flex-col min-w-0 relative transition-all duration-200">
        {/* Top spacer on mobile for the fixed hamburger button */}
        <div className="h-16 md:hidden shrink-0" />

        {/* Page content wrapper */}
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
