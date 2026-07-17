"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  History,
  Calendar,
  User,
  Info,
  GitBranch,
  RefreshCw,
  ChevronRight,
  Layers,
  Trash2,
  Copy,
  Search,
  Eye,
  CheckCircle2,
  X,
  Filter,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  listSops,
  listSopVersions,
  listSopExecutions,
  archiveSop,
  createSop,
  getSop,
  Sop,
  SopVersion,
  SopExecution,
} from "@/lib/services/db";
import VisualDiff from "@/components/history/VisualDiff";

type Tab = "runs" | "versions";

export default function HistoryVaultPage() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("runs");

  // Data State
  const [sops, setSops] = useState<Sop[]>([]);
  const [executions, setExecutions] = useState<
    (SopExecution & { sopTitle?: string; targetEnvironment?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEnv, setFilterEnv] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Selected SOP Versions State
  const [selectedSop, setSelectedSop] = useState<Sop | null>(null);
  const [sopVersions, setSopVersions] = useState<SopVersion[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Selected Execution State (for details popup)
  const [selectedExecution, setSelectedExecution] = useState<
    (SopExecution & { sop?: Sop }) | null
  >(null);

  // Compare Modal State
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareVersions, setCompareVersions] = useState<{
    vA: SopVersion;
    vB: SopVersion;
    numA: number;
    numB: number;
  } | null>(null);

  // Syncing / Action Loader State
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    async function loadHistory() {
      if (!user || !profile) return;
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch active SOPs
        const fetchedSops = await listSops(profile.organization_id, {
          includeArchived: false,
        });
        setSops(fetchedSops);

        // 2. Fetch executions for all fetched SOPs
        const execPromises = fetchedSops.map(async (sop) => {
          const list = await listSopExecutions(sop.id);
          return list.map((ex) => ({
            ...ex,
            sopTitle: sop.title,
            targetEnvironment:
              sop.dsl_payload.metadata.targetEnvironment || "unspecified",
          }));
        });
        const nestedExecs = await Promise.all(execPromises);
        const flattenedExecs = nestedExecs
          .flat()
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
        setExecutions(flattenedExecs);
      } catch (err) {
        console.error("Failed to load history vault data:", err);
        setError(
          "Failed to fetch historical runs and document versions. Please check connection.",
        );
      } finally {
        setLoading(false);
      }
    }

    if (user && profile) {
      loadHistory();
    }
  }, [user, profile]);

  // Load versions when an SOP is selected
  const handleSelectSop = async (sop: Sop) => {
    setSelectedSop(sop);
    setSelectedVersions([]);
    try {
      setLoadingVersions(true);
      const list = await listSopVersions(sop.id);
      setSopVersions(list);
    } catch (err) {
      console.error("Failed to fetch SOP versions:", err);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Handle version selection checkbox changes
  const handleSelectVersionCheckbox = (verId: string) => {
    setSelectedVersions((prev) => {
      if (prev.includes(verId)) {
        return prev.filter((id) => id !== verId);
      }
      if (prev.length >= 2) {
        // Limit selection to 2 versions
        return [prev[1], verId];
      }
      return [...prev, verId];
    });
  };

  // Open the Compare modal
  const handleCompare = () => {
    if (selectedVersions.length !== 2 || !selectedSop) return;
    const vA = sopVersions.find((v) => v.id === selectedVersions[0]);
    const vB = sopVersions.find((v) => v.id === selectedVersions[1]);
    if (!vA || !vB) return;

    // Arrange chronological order
    const ordered = [vA, vB].sort(
      (a, b) => a.version_number - b.version_number,
    );
    setCompareVersions({
      vA: ordered[0],
      vB: ordered[1],
      numA: ordered[0].version_number,
      numB: ordered[1].version_number,
    });
    setIsCompareOpen(true);
  };

  // Soft delete/archive an SOP with Optimistic UI Update
  const handleArchiveSop = async (sopId: string) => {
    if (
      !confirm(
        "Are you sure you want to archive this SOP? It will be hidden from the active dashboard.",
      )
    )
      return;

    // Save previous state for rollback
    const previousSops = [...sops];

    // Optimistic UI Update: immediately hide the archived SOP
    setSops((prev) => prev.filter((s) => s.id !== sopId));
    if (selectedSop?.id === sopId) {
      setSelectedSop(null);
      setSopVersions([]);
    }

    try {
      setActionLoading(sopId);
      await archiveSop(sopId, true);
    } catch (err) {
      console.error("Archive operation failed, rolling back:", err);
      alert("Failed to archive SOP. Reverting changes.");
      // Rollback on failure
      setSops(previousSops);
    } finally {
      setActionLoading(null);
    }
  };

  // Duplicate / Restore an older version as a new SOP
  const handleDuplicateVersion = async (version: SopVersion) => {
    if (!user || !profile || !selectedSop) return;
    const titlePrompt = prompt(
      "Enter a title for the restored SOP:",
      `${selectedSop.title} (Restored v${version.version_number})`,
    );
    if (!titlePrompt) return;

    try {
      setActionLoading(version.id);
      const newSop = await createSop(
        profile.organization_id,
        titlePrompt,
        selectedSop.description,
        selectedSop.project_id,
        selectedSop.original_transcript_id,
        version.dsl_payload,
        user.id,
      );

      // Add to list and select it
      setSops((prev) => [newSop, ...prev]);
      alert(`Successfully restored v${version.version_number} as a new SOP!`);
    } catch (err) {
      console.error("Restore failed:", err);
      alert("Failed to restore version.");
    } finally {
      setActionLoading(null);
    }
  };

  // Fetch full execution details (including matching SOP title/steps)
  const handleOpenExecutionDetails = async (
    exec: SopExecution & { sopTitle?: string },
  ) => {
    try {
      const sopRecord = await getSop(exec.sop_id);
      setSelectedExecution({
        ...exec,
        sop: sopRecord,
      });
    } catch (err) {
      console.error("Failed to load execution SOP context:", err);
      setSelectedExecution({
        ...exec,
      });
    }
  };

  // Filtered runs calculation
  const filteredExecutions = useMemo(() => {
    return executions.filter((exec) => {
      const matchSearch =
        exec.sopTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exec.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchEnv =
        filterEnv === "all" || exec.targetEnvironment === filterEnv;
      const matchStatus =
        filterStatus === "all" || exec.status === filterStatus;
      return matchSearch && matchEnv && matchStatus;
    });
  }, [executions, searchQuery, filterEnv, filterStatus]);

  // Unique environments list for filter dropdown
  const uniqueEnvs = useMemo(() => {
    const envs = executions
      .map((e) => e.targetEnvironment)
      .filter(Boolean) as string[];
    return Array.from(new Set(envs));
  }, [executions]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20 relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-sidebar-border/40 select-none">
        <div className="space-y-1.5">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <History className="w-8 h-8 text-accent-primary" />
            History Vault
          </h1>
          <p className="text-sm md:text-base text-text-muted max-w-2xl leading-relaxed">
            Audit past incident runs, compare state modifications, and recover
            historical version states.
          </p>
        </div>
      </div>

      {/* Primary Tab Toggle */}
      <div className="flex border-b border-box-border/80 select-none">
        <button
          onClick={() => {
            setActiveTab("runs");
            setSelectedSop(null);
          }}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition -mb-px cursor-pointer ${
            activeTab === "runs"
              ? "border-accent-primary text-accent-primary"
              : "border-transparent text-text-muted hover:text-foreground"
          }`}
        >
          <Layers className="w-4 h-4" />
          Incident Run Executions
        </button>
        <button
          onClick={() => {
            setActiveTab("versions");
          }}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition -mb-px cursor-pointer ${
            activeTab === "versions"
              ? "border-accent-primary text-accent-primary"
              : "border-transparent text-text-muted hover:text-foreground"
          }`}
        >
          <GitBranch className="w-4 h-4" />
          SOP Versions & Diff Engine
        </button>
      </div>

      {/* Main Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-accent-primary" />
          <span className="text-sm font-semibold text-text-muted font-mono">
            Loading History Data...
          </span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 max-w-lg mx-auto flex items-start gap-3">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs font-mono">{error}</div>
        </div>
      ) : activeTab === "runs" ? (
        /* TAB 1: INCIDENT EXECUTIONS */
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-box-bg rounded-xl border border-box-border p-4 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between select-none">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search run ID or SOP Title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-box-border bg-background text-xs text-foreground outline-none focus:border-accent-primary transition"
              />
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-1.5 text-xs text-text-muted font-semibold">
                <Filter className="w-3.5 h-3.5" /> Filters:
              </div>
              {/* Environment Filter */}
              <select
                value={filterEnv}
                onChange={(e) => setFilterEnv(e.target.value)}
                className="rounded-lg border border-box-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent-primary transition cursor-pointer"
              >
                <option value="all">All Environments</option>
                {uniqueEnvs.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-box-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent-primary transition cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="aborted">Aborted</option>
              </select>
            </div>
          </div>

          {/* Runs Table */}
          <div className="border border-box-border rounded-xl bg-box-bg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs select-none">
              <thead>
                <tr className="bg-box-line-numbers-bg border-b border-box-border font-semibold text-text-muted">
                  <th className="p-3.5">Execution Run ID</th>
                  <th className="p-3.5">SOP Title</th>
                  <th className="p-3.5">Environment</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Executed At</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExecutions.map((exec) => (
                  <tr
                    key={exec.id}
                    className="border-b border-box-border/50 hover:bg-background/20 transition-all"
                  >
                    <td className="p-3.5 font-mono text-slate-300 font-semibold select-all">
                      {exec.id.substring(0, 18)}...
                    </td>
                    <td className="p-3.5 font-semibold text-foreground truncate max-w-xs select-text">
                      {exec.sopTitle || "Deleted SOP"}
                    </td>
                    <td className="p-3.5 font-mono text-text-muted capitalize">
                      {exec.targetEnvironment}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold border text-[10px] capitalize ${
                          exec.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : exec.status === "running"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                      >
                        {exec.status}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-text-muted">
                      {new Date(exec.created_at).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleOpenExecutionDetails(exec)}
                        className="inline-flex items-center gap-1.5 border border-box-border bg-background hover:bg-box-border text-[10px] font-bold py-1.5 px-3 rounded-lg text-foreground hover:scale-102 active:scale-98 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-accent-primary" />{" "}
                        Inspect log
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredExecutions.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-text-muted italic"
                    >
                      No matching incident executions found in history vault.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB 2: SOP VERSION HISTORY & DIFF ENGINE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* SOP Selector list (Left Sidebar) */}
          <div className="lg:col-span-5 space-y-4 select-none">
            <h3 className="text-xs font-bold uppercase tracking-[.15em] text-[#91a3b9] px-1">
              Select Document SOP
            </h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {sops.map((sop) => (
                <button
                  key={sop.id}
                  onClick={() => handleSelectSop(sop)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition duration-150 cursor-pointer ${
                    selectedSop?.id === sop.id
                      ? "border-accent-primary bg-[#081324]"
                      : "border-box-border bg-box-bg/60 hover:bg-box-border/60 hover:border-box-border"
                  }`}
                >
                  <div className="space-y-1.5 max-w-[85%]">
                    <h4 className="text-xs font-bold text-foreground truncate">
                      {sop.title}
                    </h4>
                    <p className="text-[10px] text-text-muted truncate leading-relaxed">
                      {sop.description}
                    </p>
                    <span className="text-[9px] font-mono text-text-muted uppercase bg-box-line-numbers-bg px-2 py-0.5 rounded border border-box-border/80">
                      {sop.dsl_payload.metadata.targetEnvironment ||
                        "Unspecified"}
                    </span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 transition ${selectedSop?.id === sop.id ? "text-accent-primary translate-x-0.5" : "text-text-muted"}`}
                  />
                </button>
              ))}
              {sops.length === 0 && (
                <div className="p-8 rounded-xl border border-dashed border-box-border bg-box-bg/20 text-center text-text-muted italic text-xs">
                  No active SOPs found. Paste incident logs in generator to
                  create one.
                </div>
              )}
            </div>
          </div>

          {/* Versions List & Action Inspector (Right) */}
          <div className="lg:col-span-7 space-y-6">
            {!selectedSop ? (
              <div className="border border-dashed border-box-border bg-box-bg/20 rounded-xl p-16 text-center select-none">
                <GitBranch className="w-12 h-12 text-text-muted/60 mx-auto mb-3 animate-pulse" />
                <h4 className="text-sm font-semibold text-text-muted">
                  No SOP Selected
                </h4>
                <p className="text-xs text-text-muted/80 mt-1 max-w-sm mx-auto">
                  Select an SOP from the left list to inspect its versions,
                  trigger the Visual Diff Engine, or duplicate older versions.
                </p>
              </div>
            ) : (
              <div className="bg-box-bg rounded-xl border border-box-border p-6 space-y-6">
                {/* Selected SOP Title Card */}
                <div className="flex items-start justify-between border-b border-box-border/50 pb-4 select-none">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">
                      {selectedSop.title}
                    </h3>
                    <p className="text-xs text-text-muted">
                      {selectedSop.description}
                    </p>
                  </div>
                  <button
                    disabled={actionLoading === selectedSop.id}
                    onClick={() => handleArchiveSop(selectedSop.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-[10px] font-bold hover:bg-red-500/20 transition cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Archive SOP
                  </button>
                </div>

                {/* Compare Toolbar */}
                <div className="flex items-center justify-between bg-background/50 rounded-xl p-3.5 border border-box-border select-none">
                  <div className="text-xs text-text-muted">
                    {selectedVersions.length === 0 ? (
                      <span>
                        Select two versions below to compare differences.
                      </span>
                    ) : selectedVersions.length === 1 ? (
                      <span>Select one more version to compare.</span>
                    ) : (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        Ready to compare two versions!
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleCompare}
                    disabled={selectedVersions.length !== 2}
                    className="inline-flex items-center gap-1.5 bg-accent-primary text-slate-950 px-4 py-2 rounded-lg text-xs font-bold hover:scale-102 active:scale-98 transition disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Compare Versions
                  </button>
                </div>

                {/* Versions List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-[.15em] text-[#91a3b9] select-none">
                    Edit History Log ({sopVersions.length} saves)
                  </h4>
                  {loadingVersions ? (
                    <div className="flex justify-center p-6">
                      <RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
                    </div>
                  ) : (
                    <div className="divide-y divide-box-border/50 border border-box-border rounded-xl overflow-hidden bg-background/30">
                      {sopVersions.map((ver) => {
                        const isChecked = selectedVersions.includes(ver.id);
                        return (
                          <div
                            key={ver.id}
                            className="flex items-center justify-between p-4 hover:bg-background/20 transition-all select-none"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() =>
                                  handleSelectVersionCheckbox(ver.id)
                                }
                                className="w-4 h-4 text-accent-primary bg-background border-box-border rounded focus:ring-accent-primary cursor-pointer accent-emerald-500"
                              />
                              <div className="space-y-1">
                                <h5 className="text-xs font-bold text-foreground">
                                  Version {ver.version_number}
                                </h5>
                                <div className="flex items-center gap-2 text-[10px] text-text-muted font-mono">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(ver.created_at).toLocaleString()}
                                  </span>
                                  <span className="border-r border-box-border h-2.5" />
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    User: {ver.updated_by.substring(0, 8)}...
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              disabled={actionLoading === ver.id}
                              onClick={() => handleDuplicateVersion(ver)}
                              className="inline-flex items-center gap-1 border border-box-border bg-background hover:bg-box-border text-[9px] font-bold py-1.5 px-2.5 rounded-lg text-foreground hover:scale-102 transition cursor-pointer"
                              title="Restore/Duplicate this version as a new SOP"
                            >
                              <Copy className="w-3 h-3" /> Restore
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: VISUAL DIFF VIEWER */}
      {isCompareOpen && compareVersions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-4xl rounded-2xl border border-box-border bg-box-bg p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-box-border/80 pb-4 select-none shrink-0">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-accent-primary" />
                Comparing SOP Versions - {selectedSop?.title}
              </h3>
              <button
                onClick={() => {
                  setIsCompareOpen(false);
                  setCompareVersions(null);
                }}
                className="p-1.5 rounded-lg hover:bg-box-border text-text-muted hover:text-foreground transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto py-6 pr-1 custom-scrollbar">
              <VisualDiff
                versionA={compareVersions.vA.dsl_payload}
                versionB={compareVersions.vB.dsl_payload}
                numA={compareVersions.numA}
                numB={compareVersions.numB}
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-box-border/80 pt-4 gap-3 select-none shrink-0">
              <button
                onClick={() => {
                  setIsCompareOpen(false);
                  setCompareVersions(null);
                }}
                className="border border-box-border bg-background hover:bg-box-border text-xs font-semibold py-2 px-4 rounded-lg text-foreground transition cursor-pointer"
              >
                Close Diff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EXECUTION DETAILS INSPECTOR */}
      {selectedExecution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-3xl rounded-2xl border border-box-border bg-box-bg p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-box-border/80 pb-4 select-none shrink-0">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Run Execution Details
                </h3>
                <p className="text-[10px] text-text-muted mt-0.5 font-mono select-all">
                  ID: {selectedExecution.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedExecution(null)}
                className="p-1.5 rounded-lg hover:bg-box-border text-text-muted hover:text-foreground transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto py-6 pr-1 space-y-6 custom-scrollbar">
              {/* Metadata row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-background/50 border border-box-border/60 text-xs font-mono select-none">
                <div>
                  <span className="text-[10px] text-text-muted block uppercase font-semibold">
                    SOP Name
                  </span>
                  <span className="text-slate-200 mt-1 block truncate font-sans font-semibold">
                    {selectedExecution.sop?.title || "Deleted SOP"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block uppercase font-semibold">
                    Environment
                  </span>
                  <span className="text-slate-200 mt-1 block font-sans font-semibold">
                    {selectedExecution.sop?.dsl_payload.metadata
                      .targetEnvironment || "unspecified"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block uppercase font-semibold">
                    Status
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 mt-1 font-semibold capitalize ${
                      selectedExecution.status === "completed"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {selectedExecution.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block uppercase font-semibold">
                    Executed At
                  </span>
                  <span className="text-slate-200 mt-1 block">
                    {new Date(selectedExecution.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Variables Used */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-[.15em] text-[#91a3b9] select-none">
                  Variables Configuration
                </h4>
                <div className="border border-box-border rounded-xl bg-background/30 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs select-none">
                    <thead>
                      <tr className="bg-box-line-numbers-bg border-b border-box-border font-semibold text-text-muted">
                        <th className="p-3">Variable Name</th>
                        <th className="p-3">Execution Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(
                        selectedExecution.variable_state || {},
                      ).map(([key, val]) => (
                        <tr
                          key={key}
                          className="border-b border-box-border/50 font-mono"
                        >
                          <td className="p-3 font-semibold text-slate-300">
                            {key}
                          </td>
                          <td className="p-3 text-accent-primary select-text">
                            {String(val)}
                          </td>
                        </tr>
                      ))}
                      {Object.keys(selectedExecution.variable_state || {})
                        .length === 0 && (
                        <tr>
                          <td
                            colSpan={2}
                            className="p-3 text-center text-text-muted italic"
                          >
                            No variables were configured during this run.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Steps Progress Checklist */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-[.15em] text-[#91a3b9] select-none">
                  Checklist Progress Details
                </h4>
                <div className="space-y-3">
                  {selectedExecution.sop?.dsl_payload.steps.map((step, idx) => {
                    const isCompleted =
                      selectedExecution.completed_steps.includes(step.id);
                    return (
                      <div
                        key={step.id}
                        className={`flex items-start gap-3 p-4 rounded-xl border select-none ${
                          isCompleted
                            ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                            : "border-box-border bg-background/20 opacity-60"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-box-border" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <h5 className="text-xs font-bold text-foreground">
                            Step {idx + 1}: {step.title}
                          </h5>
                          <p className="text-[11px] text-text-muted select-text">
                            {step.content}
                          </p>
                          {step.type === "command" &&
                            step.payload?.commandString && (
                              <code className="block rounded-lg bg-slate-950 p-2 text-[10px] font-mono mt-2 text-slate-400 select-text">
                                {step.payload.commandString}
                              </code>
                            )}
                        </div>
                      </div>
                    );
                  })}
                  {!selectedExecution.sop && (
                    <div className="p-4 rounded-xl border border-box-border/80 bg-background/20 text-center text-xs text-text-muted italic">
                      The original SOP details cannot be loaded to map checklist
                      names.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-box-border/80 pt-4 select-none shrink-0">
              <button
                onClick={() => setSelectedExecution(null)}
                className="border border-box-border bg-background hover:bg-box-border text-xs font-semibold py-2 px-4 rounded-lg text-foreground transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
