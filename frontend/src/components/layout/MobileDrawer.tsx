"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutStore } from "@/stores/layoutStore";
import {
  LayoutDashboard,
  FileCode,
  History,
  LayoutTemplate,
  Settings,
  Menu,
  X,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const navItems: NavItem[] = [
  {
    name: "Dashboard Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { name: "SOP Generator", href: "/dashboard/generator", icon: FileCode },
  { name: "History Vault", href: "/dashboard/history", icon: History },
  {
    name: "Template Library",
    href: "/dashboard/templates",
    icon: LayoutTemplate,
  },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function MobileDrawer() {
  const sidebarMobileOpen = useLayoutStore((state) => state.sidebarMobileOpen);
  const toggleMobileDrawer = useLayoutStore(
    (state) => state.toggleMobileDrawer,
  );
  const closeMobileDrawer = useLayoutStore((state) => state.closeMobileDrawer);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      {/* Fixed Hamburger Trigger Button */}
      <button
        onClick={toggleMobileDrawer}
        className="fixed top-4 left-4 z-40 p-2 bg-sidebar-bg border border-sidebar-border rounded-lg text-text-muted hover:text-foreground hover:bg-sidebar-border transition-colors shadow-md"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      <div
        onClick={closeMobileDrawer}
        className={`fixed inset-0 z-50 bg-background/60 backdrop-blur-sm transition-opacity duration-300 ${
          sidebarMobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer Panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-sidebar-bg border-r border-sidebar-border text-foreground p-5 flex flex-col transition-transform duration-300 ease-in-out transform ${
          sidebarMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-sidebar-border shrink-0">
          <span className="text-xl font-bold text-foreground tracking-wider">
            ContextSOP
          </span>
          <button
            onClick={closeMobileDrawer}
            className="p-1.5 rounded-lg text-text-muted hover:text-foreground hover:bg-sidebar-border transition-colors"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileDrawer}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 relative group ${
                  isActive
                    ? "text-accent-primary bg-sidebar-border"
                    : "text-text-muted hover:text-foreground hover:bg-sidebar-border/50"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-md bg-accent-primary" />
                )}
                <Icon
                  className={`w-5 h-5 shrink-0 ${isActive ? "text-accent-primary" : "text-text-muted group-hover:text-foreground"}`}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer info or user profile placeholder */}
        <div className="pt-4 border-t border-sidebar-border shrink-0">
          <div className="flex items-center space-x-3 px-2">
            <div className="w-8 h-8 rounded-full bg-accent-primary text-slate-950 dark:text-slate-950 flex items-center justify-center font-semibold">
              U
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-foreground truncate">
                User Account
              </p>
              <p className="text-[10px] text-text-muted truncate">
                user@contextsop.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
