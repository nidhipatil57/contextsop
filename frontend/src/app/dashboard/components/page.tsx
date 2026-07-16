"use client";

import React, { useState } from "react";
import { Cpu, FileJson, Layers, Network, Loader2, Sparkles, AlertCircle, FileCode } from "lucide-react";
import ComponentSandbox from "@/components/generator/ComponentSandbox";
import { createClient } from "@/utils/supabase/client";

const DEFAULT_CODE = `import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, Cpu } from 'lucide-react';

export default function CpuMonitor() {
  const [cpuUsage, setCpuUsage] = useState(42);
  const [history, setHistory] = useState([30, 45, 38, 50, 48, 42]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextUsage = Math.floor(30 + Math.random() * 55);
      setCpuUsage(nextUsage);
      setHistory(prev => [...prev.slice(1), nextUsage]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md max-w-sm mx-auto shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-emerald-400 animate-pulse" />
          <h3 className="font-semibold text-sm text-slate-200 font-mono">CPU Monitor</h3>
        </div>
        <span className={\`text-xs px-2.5 py-0.5 rounded-full font-semibold font-mono \${
          cpuUsage > 80 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        }\`}>
          {cpuUsage}%
        </span>
      </div>

      {/* Sparkline Graph */}
      <div className="flex items-end gap-1.5 h-16 mb-4">
        {history.map((val, i) => (
          <div
            key={i}
            style={{ height: \`\${val}%\` }}
            className={\`flex-1 rounded-t transition-all duration-500 \${
              val > 80 ? 'bg-red-500/60' : 'bg-emerald-500/60'
            }\`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Activity className="w-3.5 h-3.5 text-slate-500" />
        <span>Status: Normal (Auto-refreshing)</span>
      </div>
    </div>
  );
}`;

const TEMPLATES = [
  {
    name: "JSON Pretty-Printer",
    icon: FileJson,
    prompt: "Create an interactive JSON Pretty-Printer & validator widget with copy button.",
  },
  {
    name: "Subnet Calculator",
    icon: Network,
    prompt: "Create an IP subnet calculator component that accepts CIDR notation and prints subnet range, broadcast, and total hosts.",
  },
  {
    name: "CPU Utilization Chart",
    icon: Cpu,
    prompt: "Create a simulated live system resource chart showing CPU, memory and disk stats.",
  },
  {
    name: "Log Filter & Colorizer",
    icon: Layers,
    prompt: "Create a simple log visualizer component that filters logs by level (INFO, WARN, ERROR) and displays them in a colored console mock.",
  },
];

export default function ComponentSandboxPage() {
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setApiError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/v1/component/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || "mock-token"}`,
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to generate component.");
      }

      if (data.code) {
        setCode(data.code);
        setSandboxError(null);
      }
    } catch (err) {
      console.error(err);
      setApiError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-sidebar-border/40">
        <div className="space-y-1.5">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-amber-400" />
            Adaptive UI & Code Generator
          </h1>
          <p className="text-sm md:text-base text-text-muted max-w-2xl leading-relaxed">
            Generate custom React UI modules dynamically for incident runbooks. Design, edit, and compile secure sandbox previews.
          </p>
        </div>
      </div>

      {/* Main Generator Controller */}
      <div className="bg-box-bg rounded-2xl border border-box-border p-6 space-y-6">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[.15em] text-[#91a3b9] mb-3">
            What custom UI component do you need?
          </label>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="e.g. A CIDR Subnet Calculator with interactive inputs..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              className="flex-1 rounded-xl border border-box-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition duration-150"
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 px-6 py-3 rounded-xl text-sm font-semibold hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Component
                </>
              )}
            </button>
          </div>
        </div>

        {/* Templates Shortcuts */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-[.15em] text-[#91a3b9]">
            Quick Templates
          </span>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {TEMPLATES.map((tmpl, idx) => {
              const Icon = tmpl.icon;
              return (
                <button
                  key={idx}
                  onClick={() => setPrompt(tmpl.prompt)}
                  disabled={loading}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-box-border/80 bg-background/40 text-left hover:bg-box-border/40 hover:border-box-border transition duration-150 group"
                >
                  <Icon className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {tmpl.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Errors Banner */}
      {apiError && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold">API Generation Failure</h4>
            <p className="text-xs text-red-300 leading-relaxed font-mono">{apiError}</p>
          </div>
        </div>
      )}

      {/* Workspace Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-[500px]">
        {/* Code Editor Panel */}
        <div className="lg:col-span-6 flex flex-col rounded-xl border border-box-border bg-box-bg overflow-hidden">
          <div className="flex items-center justify-between border-b border-box-border bg-box-line-numbers-bg px-4 py-3 select-none">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-accent-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground font-mono">React Component Editor</span>
            </div>
            {sandboxError && (
              <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider font-mono">
                Compilation Errors
              </span>
            )}
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
            className="flex-1 w-full p-4 font-mono text-xs text-box-text bg-background outline-none resize-none min-h-[400px] leading-relaxed custom-scrollbar"
          />
        </div>

        {/* Sandbox Preview Panel */}
        <div className="lg:col-span-6 flex flex-col h-full">
          <ComponentSandbox code={code} onCompileError={setSandboxError} />
        </div>
      </div>
    </div>
  );
}
