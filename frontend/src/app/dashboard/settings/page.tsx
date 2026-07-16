"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Laptop, User, Building } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Manage your profile, organization, and API limits.
        </p>
      </div>

      {/* Appearance Section */}
      <section className="bg-sidebar-bg border border-sidebar-border rounded-xl p-5 md:p-6 shadow-sm">
        <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-sidebar-border">
          <Laptop className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
        </div>

        <p className="text-sm text-text-muted mb-4">
          Customize how ContextSOP looks on your device.
        </p>

        <div className="grid grid-cols-3 gap-3 max-w-md">
          <button
            onClick={() => setTheme("light")}
            className={`flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
              mounted && theme === "light"
                ? "border-accent-primary bg-sidebar-border text-accent-primary"
                : "border-sidebar-border bg-sidebar-bg/50 hover:bg-sidebar-border/50 text-text-muted hover:text-foreground"
            }`}
          >
            <Sun className="w-4 h-4 shrink-0" />
            <span>Light</span>
          </button>

          <button
            onClick={() => setTheme("dark")}
            className={`flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
              mounted && theme === "dark"
                ? "border-accent-primary bg-sidebar-border text-accent-primary"
                : "border-sidebar-border bg-sidebar-bg/50 hover:bg-sidebar-border/50 text-text-muted hover:text-foreground"
            }`}
          >
            <Moon className="w-4 h-4 shrink-0" />
            <span>Dark</span>
          </button>

          <button
            onClick={() => setTheme("system")}
            className={`flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
              mounted && theme === "system"
                ? "border-accent-primary bg-sidebar-border text-accent-primary"
                : "border-sidebar-border bg-sidebar-bg/50 hover:bg-sidebar-border/50 text-text-muted hover:text-foreground"
            }`}
          >
            <Laptop className="w-4 h-4 shrink-0" />
            <span>System</span>
          </button>
        </div>
      </section>

      {/* Profile Section */}
      <section className="bg-sidebar-bg border border-sidebar-border rounded-xl p-5 md:p-6 shadow-sm">
        <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-sidebar-border">
          <User className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            User Profile
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="bg-sidebar-bg/40 border border-sidebar-border rounded-lg px-3.5 py-2.5 text-sm text-foreground/80 font-medium">
              John Doe
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="bg-sidebar-bg/40 border border-sidebar-border rounded-lg px-3.5 py-2.5 text-sm text-foreground/80 font-medium truncate">
              john.doe@contextsop.com
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-text-muted">
          * Profile details will become editable once connected to Supabase
          authentication.
        </p>
      </section>

      {/* Organization & API Limits Section */}
      <section className="bg-sidebar-bg border border-sidebar-border rounded-xl p-5 md:p-6 shadow-sm">
        <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-sidebar-border">
          <Building className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Organization & API Limits
          </h2>
        </div>

        <div className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Connected Organization
            </label>
            <div className="bg-sidebar-bg/40 border border-sidebar-border rounded-lg px-3.5 py-2.5 text-sm text-text-muted/80 font-medium italic">
              Not connected yet
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Monthly API Usage Limit
            </label>
            <div className="bg-sidebar-bg/40 border border-sidebar-border rounded-lg p-4 text-sm text-foreground/80">
              <div className="flex justify-between text-xs font-semibold text-text-muted mb-1.5">
                <span>SOP Generation Runs</span>
                <span>0 / 50 runs used</span>
              </div>
              <div className="w-full bg-sidebar-border h-2 rounded-full overflow-hidden">
                <div className="bg-accent-primary h-full w-0 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
