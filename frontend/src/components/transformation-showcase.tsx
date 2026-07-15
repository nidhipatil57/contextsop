"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const incidentLines = [
  "10:41  #payments-incidents  alex: latency has spiked again",
  "10:42  kube-alert: payments-api is restarting in prod-eu",
  "10:43  priya: confirmed OOMKilled — 2Gi limit is too low",
  "10:45  alex: checking events before we change the deployment",
  "10:47  priya: raise memory, then wait for a clean rollout",
];

const steps = [
  "Confirm the blast radius",
  "Inspect pod events",
  "Scale the recovered deployment",
];

export function TransformationShowcase() {
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const runTransformation = () => {
    if (isRunning) return;
    if (isMobile || reducedMotion) {
      setIsComplete((value) => !value);
      return;
    }
    setIsComplete(false);
    setIsRunning(true);
    window.setTimeout(() => {
      setIsRunning(false);
      setIsComplete(true);
    }, 1650);
  };

  return (
    <section className="showcase shell" id="demo" aria-labelledby="showcase-title">
      <div className="section-heading showcase-heading">
        <div>
          <p className="eyebrow">Interactive compilation</p>
          <h2 id="showcase-title">See the context become the runbook.</h2>
        </div>
        <p>One focused pass extracts signal, preserves safeguards, and gives responders a shared recovery path.</p>
      </div>

      <div className="transformation-grid">
        <div className="demo-pane raw-pane">
          <div className="pane-label"><span className="status-dot amber" /> Raw incident channel</div>
          <div className="terminal" aria-label="Sample incident transcript">
            {incidentLines.map((line, index) => (
              <motion.p
                animate={isRunning ? { opacity: [0.46, 1, 0.6] } : { opacity: 1 }}
                className={isRunning ? "scanning-line" : ""}
                key={line}
                transition={{ delay: index * 0.19, duration: 0.42 }}
              >
                <span>{String(index + 41).padStart(2, "0")}</span>{line}
              </motion.p>
            ))}
            <motion.div className="scanner" animate={isRunning ? { top: ["0%", "100%"] } : { top: "-12%" }} transition={{ duration: 1.45, ease: "easeInOut" }} />
          </div>
          <p className="pane-note">Unstructured messages, alerts, and partial diagnosis.</p>
        </div>

        <div className="transform-control">
          <motion.button
            aria-label={isComplete ? "Reset transformation demo" : "Compile incident into SOP"}
            className="compile-button"
            onClick={runTransformation}
            whileHover={isMobile ? undefined : { scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <span>{isRunning ? "Compiling" : isComplete ? "Run again" : "Compile SOP"}</span>
            <b aria-hidden="true">→</b>
          </motion.button>
          <span>safe DSL</span>
        </div>

        <div className="demo-pane sop-pane" aria-live="polite">
          <div className="pane-label"><span className="status-dot emerald" /> Generated recovery SOP</div>
          <div className="sop-card">
            <div className="sop-topline"><span>payments-api</span><small>prod-eu · 6 min</small></div>
            <div className="variable-row"><span>VARIABLE</span><code>NAMESPACE <b>prod-eu</b></code></div>
            <AnimatePresence initial={false}>
              {isComplete && steps.map((step, index) => (
                <motion.div className="check-row" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} key={step} transition={{ delay: index * 0.18 }}>
                  <span>{index + 1}</span>{step}
                </motion.div>
              ))}
            </AnimatePresence>
            {!isComplete && <p className="empty-sop">Click compile to extract variables, checks, and the validated recovery command.</p>}
            <motion.code animate={isComplete ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 5 }} className="command">
              kubectl rollout status deploy/payments-api -n <b>prod-eu</b>
            </motion.code>
          </div>
          <p className="pane-note">A stateful procedure, ready for a responder to execute and verify.</p>
        </div>
      </div>
    </section>
  );
}
