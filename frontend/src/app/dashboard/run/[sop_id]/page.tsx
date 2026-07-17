"use client";

import React, { useEffect, useState, use } from "react";
import {
  getSop,
  Sop,
  createSopExecution,
  updateSopExecution,
} from "@/lib/services/db";
import { useRunbookStore, StepStatus } from "@/stores/runbookStore";
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Terminal,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/auth-provider";

interface PageProps {
  params: Promise<{ sop_id: string }>;
}

export default function RunbookPage({ params }: PageProps) {
  const { sop_id } = use(params);
  const [sop, setSop] = useState<Sop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [verifyingStepId, setVerifyingStepId] = useState<string | null>(null);

  // Zustand active execution store bindings
  const stepsProgress = useRunbookStore((state) => state.stepsProgress);
  const variablesState = useRunbookStore((state) => state.variablesState);
  const activeStepIndex = useRunbookStore((state) => state.activeStepIndex);
  const verificationLogs = useRunbookStore((state) => state.verificationLogs);
  const executionId = useRunbookStore((state) => state.executionId);

  const initializeRun = useRunbookStore((state) => state.initializeRun);
  const setExecutionId = useRunbookStore((state) => state.setExecutionId);
  const updateVariable = useRunbookStore((state) => state.updateVariable);
  const setStepStatus = useRunbookStore((state) => state.setStepStatus);
  const setActiveStepIndex = useRunbookStore(
    (state) => state.setActiveStepIndex,
  );
  const setVerificationLog = useRunbookStore(
    (state) => state.setVerificationLog,
  );
  const resetRun = useRunbookStore((state) => state.resetRun);

  const { user, profile } = useAuth();

  // 1. Fetch SOP detail from DB and initialize run
  useEffect(() => {
    async function loadSop() {
      if (!user || !profile) return;
      try {
        setLoading(true);
        const record = await getSop(sop_id);
        setSop(record);

        // Prepopulate default variables
        const initialVars: Record<string, string> = {};
        record.dsl_payload.variables.forEach((v) => {
          initialVars[v.name] = v.defaultValue;
        });

        const stepIds = record.dsl_payload.steps.map((s) => s.id);

        // If it's a new SOP or we don't have an active executionId, create one
        const storeSopId = useRunbookStore.getState().sopId;
        const storeExecutionId = useRunbookStore.getState().executionId;

        if (storeSopId !== sop_id || !storeExecutionId) {
          // Initialize local store first (set executionId = null temporarily)
          initializeRun(sop_id, stepIds, initialVars, null);

          // Create the execution record in database
          const exec = await createSopExecution(
            sop_id,
            user.id,
            profile.organization_id,
            initialVars,
          );
          setExecutionId(exec.id);
        }
      } catch (err) {
        console.error("Failed to load runbook SOP:", err);
        setError(
          "Could not retrieve SOP details. Make sure the record exists.",
        );
      } finally {
        setLoading(false);
      }
    }
    if (user && profile) {
      loadSop();
    }
  }, [sop_id, user, profile, initializeRun, setExecutionId]);

  // 1.1. Synchronize execution progress to the database
  useEffect(() => {
    if (!executionId || !sop) return;

    // Extract completed steps from store
    const completed = Object.entries(stepsProgress)
      .filter(([, status]) => status === "completed" || status === "skipped")
      .map(([stepId]) => stepId);

    // Determine current overall status
    let currentStatus: "running" | "completed" | "failed" | "aborted" =
      "running";
    const allStepsCount = sop.dsl_payload.steps.length;
    if (completed.length === allStepsCount) {
      currentStatus = "completed";
    }

    // Debounced sync to database
    const timer = setTimeout(async () => {
      try {
        await updateSopExecution(
          executionId,
          completed,
          currentStatus,
          variablesState,
        );
      } catch (err) {
        console.error("Failed to sync execution progress to DB:", err);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [executionId, stepsProgress, variablesState, sop]);

  const handleResetAndStartNewRun = async () => {
    if (!sop || !user || !profile) return;
    try {
      resetRun();
      const stepIds = sop.dsl_payload.steps.map((s) => s.id);
      const initialVars: Record<string, string> = {};
      sop.dsl_payload.variables.forEach((v) => {
        initialVars[v.name] = v.defaultValue;
      });

      // Create new execution record in database
      const exec = await createSopExecution(
        sop_id,
        user.id,
        profile.organization_id,
        initialVars,
      );

      initializeRun(sop_id, stepIds, initialVars, exec.id);
    } catch (err) {
      console.error("Failed to create new execution run:", err);
    }
  };

  // 2. Interpolate variable placeholders in strings with try-catch fallback
  const interpolateString = (
    template: string,
    vars: Record<string, string>,
  ): string => {
    try {
      return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, g1) => {
        return vars[g1] !== undefined ? vars[g1] : match;
      });
    } catch (e) {
      console.error("Interpolation failed, rendering raw string fallback:", e);
      return template;
    }
  };

  // 3. Safe copy handling: strip Carriage Returns and leading/trailing newlines to prevent injection
  const handleCopy = (text: string, stepId: string) => {
    const sanitized = text.replace(/\r/g, "").trim();
    navigator.clipboard.writeText(sanitized);
    setCopiedId(stepId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 4. Trigger SSRF-mitigated backend verification check
  const handleVerify = async (
    stepId: string,
    rawUrl: string,
    expectedResponse?: string,
  ) => {
    setVerifyingStepId(stepId);
    setVerificationLog(stepId, {
      status: "running",
      message: "Dialing backend verification proxy...",
      timestamp: new Date().toLocaleTimeString(),
    });

    const targetUrl = interpolateString(rawUrl, variablesState);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/v1/sop/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || "mock-token"}`,
        },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed verification check.");
      }

      const matchCode = expectedResponse ? parseInt(expectedResponse) : 200;
      const statusMatched = data.statusCode === matchCode;

      setVerificationLog(stepId, {
        status: statusMatched ? "success" : "failure",
        message: statusMatched
          ? `[SUCCESS] Host responded with expected code ${data.statusCode} (${data.statusText}).`
          : `[FAILED] Expected response code ${matchCode}, but received status code ${data.statusCode} (${data.statusText}).`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Unknown connection issue";
      setVerificationLog(stepId, {
        status: "failure",
        message: `[ERROR] Verification connection failed: ${errMsg}`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setVerifyingStepId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="text-sm font-semibold text-text-muted font-mono">
          Loading Interactive Runbook...
        </span>
      </div>
    );
  }

  if (error || !sop) {
    return (
      <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 max-w-lg mx-auto flex items-start gap-3 mt-12">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-sm">Execution Error</h4>
          <p className="text-xs mt-1 font-mono">{error || "SOP not loaded."}</p>
        </div>
      </div>
    );
  }

  const steps = sop.dsl_payload.steps;
  const metadata = sop.dsl_payload.metadata;
  const variables = sop.dsl_payload.variables;

  // Sequential execution defaults to true if not specified
  const isSequential = metadata.sequentialExecution !== false;

  // 5. Sliding-window virtualization boundaries: activeStepIndex - 2 to activeStepIndex + 5
  const windowStart = Math.max(0, activeStepIndex - 2);
  const windowEnd = Math.min(steps.length, activeStepIndex + 6);
  const visibleSteps = steps.slice(windowStart, windowEnd);

  const handleStepComplete = (index: number) => {
    const currentStep = steps[index];
    setStepStatus(currentStep.id, "completed");

    if (index + 1 < steps.length) {
      const nextStep = steps[index + 1];
      setStepStatus(nextStep.id, "active");
      setActiveStepIndex(index + 1);
    } else {
      // Completed last step
      setActiveStepIndex(steps.length);
    }
  };

  const handleStepSkip = (index: number) => {
    const currentStep = steps[index];
    setStepStatus(currentStep.id, "skipped");

    if (index + 1 < steps.length) {
      const nextStep = steps[index + 1];
      setStepStatus(nextStep.id, "active");
      setActiveStepIndex(index + 1);
    } else {
      setActiveStepIndex(steps.length);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto pb-20 items-start">
      {/* Parameters Overrides Sidebar (Left) */}
      <div className="lg:col-span-4 bg-box-bg rounded-2xl border border-box-border p-6 space-y-6 lg:sticky lg:top-8">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[.15em] text-[#91a3b9] mb-1">
            Run Parameters
          </h3>
          <p className="text-xs text-text-muted">
            Modify values below to instantly update variables across all command
            boxes.
          </p>
        </div>

        {variables.length === 0 ? (
          <div className="text-xs text-text-muted font-mono p-3 bg-background/50 rounded border border-box-border/80">
            No input variables defined for this procedure.
          </div>
        ) : (
          <div className="space-y-4">
            {variables.map((v) => (
              <div key={v.name} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 font-mono">
                    {v.name}
                  </label>
                  <span className="text-[10px] text-text-muted lowercase bg-box-line-numbers-bg px-2 py-0.5 rounded border border-box-border/60">
                    {v.type}
                  </span>
                </div>
                <input
                  type="text"
                  value={variablesState[v.name] || ""}
                  onChange={(e) => updateVariable(v.name, e.target.value)}
                  placeholder={v.label}
                  className="w-full rounded-lg border border-box-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent-primary transition font-mono"
                />
                <span className="text-[10px] text-text-muted leading-tight block">
                  {v.label}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleResetAndStartNewRun}
          className="w-full flex items-center justify-center gap-2 border border-box-border bg-background hover:bg-box-border text-xs font-semibold py-2.5 rounded-lg text-foreground transition select-none cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reset Execution Progress
        </button>
      </div>

      {/* Main Runbook Execution Panel (Right) */}
      <div className="lg:col-span-8 space-y-6">
        {/* Procedure Header Card */}
        <div className="bg-box-bg rounded-2xl border border-box-border p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-box-border/50 pb-4">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-accent-primary bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 rounded">
                Live Incident Runbook
              </span>
              <h2 className="text-xl font-bold text-foreground">
                {metadata.title}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 capitalize font-mono animate-pulse">
                Active
              </span>
            </div>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            {metadata.description}
          </p>
          <div className="flex flex-wrap gap-4 text-xs font-mono text-text-muted">
            {metadata.targetEnvironment && (
              <div>
                Target Env:{" "}
                <span className="text-slate-300">
                  {metadata.targetEnvironment}
                </span>
              </div>
            )}
            {metadata.estimatedDuration && (
              <div>
                Estimated:{" "}
                <span className="text-slate-300">
                  {metadata.estimatedDuration} mins
                </span>
              </div>
            )}
            <div>
              Ordering:{" "}
              <span className="text-slate-300">
                {isSequential ? "Strict (Sequential)" : "Unconstrained"}
              </span>
            </div>
          </div>
        </div>

        {/* virtualized checklist flow */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2 select-none">
            <span className="text-xs font-bold uppercase tracking-[.15em] text-[#91a3b9]">
              Operations Checklist
            </span>
            <span className="text-[10px] font-mono text-text-muted bg-box-line-numbers-bg px-2 py-0.5 rounded border border-box-border">
              Displaying steps {windowStart + 1}-
              {Math.min(steps.length, windowEnd)} of {steps.length}
            </span>
          </div>

          {activeStepIndex === steps.length ? (
            <div className="p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-center space-y-4 max-w-md mx-auto">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">
                  SOP Execution Complete
                </h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  All procedures have been successfully logged, verified, and
                  closed. Thank you.
                </p>
              </div>
              <button
                onClick={handleResetAndStartNewRun}
                className="inline-flex items-center gap-2 bg-emerald-500 text-slate-950 font-semibold text-xs py-2 px-4 rounded-lg cursor-pointer hover:scale-105 transition"
              >
                Start New Run
              </button>
            </div>
          ) : (
            visibleSteps.map((step) => {
              const globalIdx = steps.findIndex((s) => s.id === step.id);
              const status: StepStatus = stepsProgress[step.id] || "pending";
              const isActive = globalIdx === activeStepIndex;
              const isLocked = isSequential && globalIdx > activeStepIndex;

              return (
                <div
                  key={step.id}
                  className={`rounded-2xl border p-5 transition-all duration-300 relative ${
                    isActive
                      ? "border-accent-primary bg-[#081324] shadow-[0_0_15px_rgba(182,156,255,0.08)] ring-1 ring-accent-primary/20 scale-[1.01]"
                      : isLocked
                        ? "border-box-border/60 bg-background/20 opacity-40 select-none pointer-events-none"
                        : status === "completed"
                          ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                          : "border-box-border bg-box-bg/50"
                  }`}
                >
                  {/* Step Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold font-mono text-[#91a3b9] bg-box-line-numbers-bg border border-box-border/80 px-2 py-0.5 rounded">
                          Step {globalIdx + 1}
                        </span>
                        {status === "completed" && (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">
                            Completed
                          </span>
                        )}
                        {status === "skipped" && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-400/10 px-2 py-0.5 rounded border border-slate-400/20">
                            Skipped
                          </span>
                        )}
                        {isActive && (
                          <span className="text-[10px] font-semibold text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded border border-accent-primary/20 animate-pulse">
                            Active Step
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-foreground">
                        {step.title}
                      </h4>
                    </div>
                  </div>

                  {/* Step Content */}
                  <p className="text-xs text-text-muted leading-relaxed mt-3 whitespace-pre-wrap select-text">
                    {step.content}
                  </p>

                  {/* Command Step rendering */}
                  {step.type === "command" && step.payload?.commandString && (
                    <div className="mt-4 space-y-2">
                      <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed group">
                        <pre className="pr-12 select-all">
                          {interpolateString(
                            step.payload?.commandString || "",
                            variablesState,
                          )}
                        </pre>
                        <button
                          onClick={() =>
                            handleCopy(
                              interpolateString(
                                step.payload?.commandString || "",
                                variablesState,
                              ),
                              step.id,
                            )
                          }
                          className="absolute right-3 top-3 p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 transition duration-150 cursor-pointer"
                          title="Copy command payload"
                        >
                          {copiedId === step.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Warning rendering */}
                  {step.type === "warning" && step.payload?.warningLevel && (
                    <div className="mt-4 p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] text-amber-400 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider font-mono">
                          Safety Warning ({step.payload.warningLevel})
                        </span>
                        <p className="text-xs text-amber-300/90 leading-relaxed">
                          Verify details before proceeding.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Verification URL integration */}
                  {step.type === "verification" &&
                    step.payload?.verificationUrl && (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              handleVerify(
                                step.id,
                                step.payload?.verificationUrl || "",
                                step.payload?.verificationExpectedResponse,
                              )
                            }
                            disabled={verifyingStepId !== null}
                            className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-semibold text-xs py-2 px-4 rounded-lg hover:scale-105 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            Verify Configuration
                          </button>
                          {step.payload.verificationExpectedResponse && (
                            <span className="text-[10px] text-text-muted font-mono">
                              Expected Status:{" "}
                              {step.payload.verificationExpectedResponse}
                            </span>
                          )}
                        </div>

                        {/* Live Verification Console Output */}
                        {verificationLogs[step.id] && (
                          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs space-y-1 shadow-inner select-text">
                            <div className="flex items-center justify-between text-[10px] text-text-muted border-b border-slate-900 pb-2 mb-2 select-none">
                              <span>Status Console Output</span>
                              <span>{verificationLogs[step.id].timestamp}</span>
                            </div>
                            <p
                              className={
                                verificationLogs[step.id].status === "success"
                                  ? "text-emerald-400"
                                  : verificationLogs[step.id].status ===
                                      "running"
                                    ? "text-slate-400 animate-pulse"
                                    : "text-red-400"
                              }
                            >
                              {verificationLogs[step.id].message}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                  {/* Manual Step Advancement Controls */}
                  {isActive && (
                    <div className="mt-5 pt-4 border-t border-box-border/60 flex items-center justify-end gap-3 select-none">
                      <button
                        onClick={() => handleStepSkip(globalIdx)}
                        className="border border-box-border bg-background hover:bg-box-border text-xs font-semibold py-1.5 px-3.5 rounded-lg text-text-muted hover:text-foreground transition cursor-pointer"
                      >
                        Skip Step
                      </button>
                      <button
                        onClick={() => handleStepComplete(globalIdx)}
                        className="bg-accent-primary hover:bg-[#cbb8ff] text-slate-950 font-semibold text-xs py-1.5 px-4 rounded-lg flex items-center gap-1 hover:scale-105 active:scale-95 transition cursor-pointer"
                      >
                        Complete Step
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
