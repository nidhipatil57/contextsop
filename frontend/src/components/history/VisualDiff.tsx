"use client";

import React from "react";
import {
  Plus,
  Minus,
  Edit,
  AlertCircle,
  FileCode,
  CheckSquare,
} from "lucide-react";
import { WorkflowDsl } from "@/lib/workflow";

interface VisualDiffProps {
  versionA: WorkflowDsl;
  versionB: WorkflowDsl;
  numA: number;
  numB: number;
}

export default function VisualDiff({
  versionA,
  versionB,
  numA,
  numB,
}: VisualDiffProps) {
  // 1. Diff variables
  const varsA = versionA.variables || [];
  const varsB = versionB.variables || [];

  const mapA = new Map(varsA.map((v) => [v.name, v]));
  const mapB = new Map(varsB.map((v) => [v.name, v]));

  const allVarNames = Array.from(
    new Set([...varsA.map((v) => v.name), ...varsB.map((v) => v.name)]),
  );

  const varDiffs = allVarNames.map((name) => {
    const a = mapA.get(name);
    const b = mapB.get(name);

    if (a && !b) {
      return { name, status: "deleted", oldVal: a, newVal: null };
    }
    if (!a && b) {
      return { name, status: "added", oldVal: null, newVal: b };
    }
    const isModified =
      a!.label !== b!.label ||
      a!.type !== b!.type ||
      a!.defaultValue !== b!.defaultValue ||
      a!.validationRegex !== b!.validationRegex;

    return {
      name,
      status: isModified ? "modified" : "unchanged",
      oldVal: a,
      newVal: b,
    };
  });

  // 2. Diff steps
  const stepsA = versionA.steps || [];
  const stepsB = versionB.steps || [];

  const stepMapA = new Map(stepsA.map((s) => [s.id, s]));
  const stepMapB = new Map(stepsB.map((s) => [s.id, s]));

  const allStepIds = Array.from(
    new Set([...stepsA.map((s) => s.id), ...stepsB.map((s) => s.id)]),
  );

  const stepDiffs = allStepIds.map((id) => {
    const a = stepMapA.get(id);
    const b = stepMapB.get(id);

    if (a && !b) {
      return { id, status: "deleted", oldVal: a, newVal: null };
    }
    if (!a && b) {
      return { id, status: "added", oldVal: null, newVal: b };
    }
    const isModified =
      a!.title !== b!.title ||
      a!.content !== b!.content ||
      a!.type !== b!.type ||
      a!.payload?.commandString !== b!.payload?.commandString ||
      a!.payload?.warningLevel !== b!.payload?.warningLevel ||
      a!.payload?.verificationUrl !== b!.payload?.verificationUrl ||
      a!.payload?.verificationExpectedResponse !==
        b!.payload?.verificationExpectedResponse;

    return {
      id,
      status: isModified ? "modified" : "unchanged",
      oldVal: a,
      newVal: b,
    };
  });

  return (
    <div className="space-y-8 select-none">
      {/* Compare Header */}
      <div className="flex items-center justify-between border-b border-box-border/80 pb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            Visual Diff Inspector
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Comparing{" "}
            <span className="text-red-400 font-semibold font-mono">
              v{numA} (Before)
            </span>{" "}
            and{" "}
            <span className="text-emerald-400 font-semibold font-mono">
              v{numB} (After)
            </span>
            .
          </p>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <span className="flex items-center gap-1 text-emerald-400">
            <Plus className="w-3.5 h-3.5" /> Added
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <Minus className="w-3.5 h-3.5" /> Deleted
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <Edit className="w-3.5 h-3.5" /> Modified
          </span>
        </div>
      </div>

      {/* Variables Section */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-[.15em] text-[#91a3b9] flex items-center gap-1.5">
          <FileCode className="w-4 h-4 text-[#91a3b9]" /> Variables Diff
        </h4>
        <div className="border border-box-border rounded-xl bg-background/50 overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-box-line-numbers-bg border-b border-box-border font-semibold text-text-muted">
                <th className="p-3">Variable Name</th>
                <th className="p-3">Label</th>
                <th className="p-3">Type</th>
                <th className="p-3">Default Value</th>
              </tr>
            </thead>
            <tbody>
              {varDiffs.map(({ name, status, oldVal, newVal }) => {
                let rowClass = "border-b border-box-border/50";
                if (status === "added")
                  rowClass += " bg-emerald-500/5 text-emerald-400";
                else if (status === "deleted")
                  rowClass += " bg-red-500/5 text-red-400 line-through";
                else if (status === "modified")
                  rowClass += " bg-amber-500/[0.03]";

                const current = newVal || oldVal;
                if (!current) return null;

                return (
                  <tr key={name} className={rowClass}>
                    <td className="p-3 font-mono font-semibold flex items-center gap-2">
                      {status === "added" && (
                        <Plus className="w-3 h-3 text-emerald-500" />
                      )}
                      {status === "deleted" && (
                        <Minus className="w-3 h-3 text-red-500" />
                      )}
                      {status === "modified" && (
                        <Edit className="w-3 h-3 text-amber-500" />
                      )}
                      {name}
                    </td>
                    <td className="p-3 select-text">
                      {status === "modified" &&
                      oldVal?.label !== newVal?.label ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-red-400/80 line-through">
                            {oldVal?.label}
                          </span>
                          <span className="text-emerald-400 font-semibold">
                            {newVal?.label}
                          </span>
                        </div>
                      ) : (
                        current.label
                      )}
                    </td>
                    <td className="p-3 font-mono">
                      {status === "modified" &&
                      oldVal?.type !== newVal?.type ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-red-400/80 line-through">
                            {oldVal?.type}
                          </span>
                          <span className="text-emerald-400 font-semibold">
                            {newVal?.type}
                          </span>
                        </div>
                      ) : (
                        current.type
                      )}
                    </td>
                    <td className="p-3 font-mono select-text">
                      {status === "modified" &&
                      oldVal?.defaultValue !== newVal?.defaultValue ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-red-400/80 line-through">
                            {oldVal?.defaultValue}
                          </span>
                          <span className="text-emerald-400 font-semibold">
                            {newVal?.defaultValue}
                          </span>
                        </div>
                      ) : (
                        current.defaultValue
                      )}
                    </td>
                  </tr>
                );
              })}
              {varDiffs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="p-4 text-center text-text-muted italic"
                  >
                    No variables defined in either version.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Steps Section */}
      <section className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-[.15em] text-[#91a3b9] flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4 text-[#91a3b9]" /> Steps Sequence Diff
        </h4>
        <div className="space-y-4">
          {stepDiffs.map(({ id, status, oldVal, newVal }) => {
            let cardClass = "border p-4 rounded-xl relative ";
            if (status === "added")
              cardClass += "border-emerald-500/20 bg-emerald-500/[0.02]";
            else if (status === "deleted")
              cardClass += "border-red-500/20 bg-red-500/[0.02] opacity-60";
            else if (status === "modified")
              cardClass += "border-amber-500/20 bg-amber-500/[0.01]";
            else cardClass += "border-box-border/80 bg-background/30";

            const current = newVal || oldVal;
            if (!current) return null;

            return (
              <div key={id} className={cardClass}>
                {/* Badge indicator */}
                <div className="absolute right-4 top-4 flex items-center gap-1 text-[10px] font-mono">
                  {status === "added" && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      + Added step
                    </span>
                  )}
                  {status === "deleted" && (
                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 line-through">
                      - Deleted step
                    </span>
                  )}
                  {status === "modified" && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      • Modified step
                    </span>
                  )}
                </div>

                <div className="space-y-2 max-w-[85%] select-text">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-text-muted bg-box-line-numbers-bg px-2 py-0.5 rounded border border-box-border">
                      {id}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-accent-primary">
                      {current.type}
                    </span>
                  </div>

                  {/* Title Diff */}
                  {status === "modified" && oldVal?.title !== newVal?.title ? (
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-red-400/80 line-through">
                        {oldVal?.title}
                      </h5>
                      <h5 className="text-sm font-bold text-emerald-400">
                        {newVal?.title}
                      </h5>
                    </div>
                  ) : (
                    <h5
                      className={`text-sm font-bold text-foreground ${status === "deleted" ? "line-through text-red-400/80" : ""}`}
                    >
                      {current.title}
                    </h5>
                  )}

                  {/* Content Diff */}
                  {status === "modified" &&
                  oldVal?.content !== newVal?.content ? (
                    <div className="text-xs space-y-1 border-l-2 border-box-border pl-3 my-2">
                      <p className="text-red-400/80 line-through whitespace-pre-wrap">
                        {oldVal?.content}
                      </p>
                      <p className="text-emerald-400 whitespace-pre-wrap">
                        {newVal?.content}
                      </p>
                    </div>
                  ) : (
                    <p
                      className={`text-xs text-text-muted leading-relaxed whitespace-pre-wrap ${status === "deleted" ? "line-through" : ""}`}
                    >
                      {current.content}
                    </p>
                  )}

                  {/* Command String Diff */}
                  {current.type === "command" && (
                    <div className="mt-3">
                      {status === "modified" &&
                      oldVal?.payload?.commandString !==
                        newVal?.payload?.commandString ? (
                        <div className="rounded-lg bg-slate-950 border border-slate-900 p-3 font-mono text-[11px] space-y-2">
                          {oldVal?.payload?.commandString && (
                            <div className="text-red-400/70 line-through whitespace-pre-wrap">
                              - {oldVal.payload.commandString}
                            </div>
                          )}
                          {newVal?.payload?.commandString && (
                            <div className="text-emerald-400 whitespace-pre-wrap">
                              + {newVal.payload.commandString}
                            </div>
                          )}
                        </div>
                      ) : (
                        current.payload?.commandString && (
                          <div
                            className={`rounded-lg bg-slate-950 border border-slate-900 p-3 font-mono text-[11px] text-slate-300 whitespace-pre-wrap ${status === "deleted" ? "line-through text-red-400/50" : ""}`}
                          >
                            {current.payload.commandString}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Warning Level Diff */}
                  {current.type === "warning" && (
                    <div className="mt-3 flex items-start gap-2 text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        {status === "modified" &&
                        oldVal?.payload?.warningLevel !==
                          newVal?.payload?.warningLevel ? (
                          <div className="flex gap-2 font-mono text-[10px]">
                            <span className="text-red-400/80 line-through">
                              Level: {oldVal?.payload?.warningLevel}
                            </span>
                            <span className="text-emerald-400 font-semibold">
                              Level: {newVal?.payload?.warningLevel}
                            </span>
                          </div>
                        ) : (
                          <span className="text-text-muted font-mono text-[10px]">
                            Warning Level:{" "}
                            <b className="text-amber-400">
                              {current.payload?.warningLevel}
                            </b>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
