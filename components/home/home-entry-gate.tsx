"use client";

import { useEffect, useState } from "react";
import styles from "./noma-home.module.css";

export const NOMA_HERO_READY_EVENT = "noma:hero-ready";

export type NomaHeroReadyDetail = {
  mode: "3d" | "fallback";
  reason?: "unsupported" | "save-data" | "scene-error" | "scene-timeout";
};

export function signalNomaHeroReady(detail: NomaHeroReadyDetail) {
  document.documentElement.dataset.nomaHeroReady = JSON.stringify(detail);
  window.dispatchEvent(new CustomEvent<NomaHeroReadyDetail>(NOMA_HERO_READY_EVENT, { detail }));
}

export function HomeEntryGate() {
  const [phase, setPhase] = useState<"loading" | "leaving" | "removed">("loading");

  useEffect(() => {
    let removeTimer = 0;

    const leaveTimer = window.setTimeout(() => {
      setPhase("leaving");
      removeTimer = window.setTimeout(() => setPhase("removed"), 620);
    }, 420);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
      delete document.documentElement.dataset.nomaHeroReady;
    };
  }, []);

  if (phase === "removed") return null;

  return (
    <div className={styles.entryGate} data-phase={phase} role="status" aria-live="polite" aria-label="Preparando experiência Noma">
      <div className={styles.entryGateContent}>
        <span className={styles.entryGateMark}>NOMA<i aria-hidden="true">.</i></span>
        <span className={styles.entryGateTrack} aria-hidden="true"><i /></span>
        <span className={styles.entryGateLabel}>Preparando o espaço</span>
      </div>
    </div>
  );
}
