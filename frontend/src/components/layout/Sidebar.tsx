"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useLayoutStore } from "@/stores/layoutStore";
import {
  LayoutDashboard,
  FileCode,
  History,
  LayoutTemplate,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Laptop,
  Sparkles,
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
  { name: "UI Components", href: "/dashboard/components", icon: Sparkles },
  { name: "History Vault", href: "/dashboard/history", icon: History },
  {
    name: "Template Library",
    href: "/dashboard/templates",
    icon: LayoutTemplate,
  },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const sidebarExpanded = useLayoutStore((state) => state.sidebarExpanded);
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    if (!mounted) return;
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const getThemeIcon = () => {
    if (!mounted) return <Sun className="w-5 h-5 shrink-0" />;
    if (theme === "light") return <Sun className="w-5 h-5 shrink-0" />;
    if (theme === "dark") return <Moon className="w-5 h-5 shrink-0" />;
    return <Laptop className="w-5 h-5 shrink-0" />;
  };

  const getThemeLabel = () => {
    if (!mounted) return "Theme";
    if (theme === "light") return "Light";
    if (theme === "dark") return "Dark";
    return "System";
  };

  return (
    <aside
      className={`hidden md:flex flex-col bg-sidebar-bg text-foreground border-r border-sidebar-border h-screen transition-all duration-200 shrink-0 ${
        sidebarExpanded ? "w-60" : "w-16"
      }`}
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border overflow-hidden shrink-0">
        {sidebarExpanded ? (
          <>
            <span className="text-lg font-bold text-foreground tracking-wider truncate">
              ContextSOP
            </span>
            <button
              onClick={cycleTheme}
              className="p-1.5 rounded-lg text-text-muted hover:text-foreground hover:bg-sidebar-border transition-colors"
              title={`Current: ${getThemeLabel()} - Click to change`}
              aria-label="Toggle theme"
            >
              {getThemeIcon()}
            </button>
          </>
        ) : (
          <span className="text-lg font-bold text-accent-primary mx-auto">
            CS
          </span>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative group ${
                isActive
                  ? "text-accent-primary bg-sidebar-border"
                  : "text-text-muted hover:text-foreground hover:bg-sidebar-border/50"
              }`}
            >
              {/* Left Accent Bar for Active Item */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-accent-primary" />
              )}

              <Icon
                className={`w-5 h-5 shrink-0 ${isActive ? "text-accent-primary" : "text-text-muted group-hover:text-foreground"}`}
              />

              {sidebarExpanded ? (
                <span className="truncate transition-opacity duration-200">
                  {item.name}
                </span>
              ) : (
                <span className="absolute left-14 bg-background text-foreground text-xs px-2 py-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-50 shadow-lg border border-sidebar-border">
                  {item.name}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div
        className={`border-t border-sidebar-border shrink-0 ${
          sidebarExpanded
            ? "px-4 py-3 flex items-center justify-between"
            : "py-3 flex flex-col items-center space-y-2"
        }`}
      >
        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-accent-primary text-slate-950 flex items-center justify-center font-semibold text-xs shrink-0 select-none">
          U
        </div>

        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className={`flex items-center text-text-muted hover:text-foreground transition-colors hover:bg-sidebar-border/50 rounded-lg p-1.5 ${
            sidebarExpanded ? "space-x-1" : ""
          }`}
          aria-label={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {sidebarExpanded ? (
            <>
              <span className="text-xs font-semibold uppercase tracking-wider">
                Collapse
              </span>
              <ChevronLeft className="w-4 h-4 shrink-0" />
            </>
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" />
          )}
        </button>
      </div>
    </aside>
  );
}
