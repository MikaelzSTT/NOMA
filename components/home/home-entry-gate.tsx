"use client";

import { useEffect, useRef, useState } from "react";
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
  const mountedAt = useRef(0);
  const previousOverflow = useRef("");

  useEffect(() => {
    mountedAt.current = performance.now();
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let removeTimer = 0;
    let leaveTimer = 0;
    let hardTimeout = 0;

    const reveal = () => {
      window.clearTimeout(hardTimeout);
      const minimumDisplay = Math.max(0, 320 - (performance.now() - mountedAt.current));
      window.clearTimeout(leaveTimer);
      leaveTimer = window.setTimeout(() => {
        setPhase("leaving");
        removeTimer = window.setTimeout(() => setPhase("removed"), 720);
      }, minimumDisplay);
    };

    const onReady = () => reveal();
    window.addEventListener(NOMA_HERO_READY_EVENT, onReady);

    // Last-resort guard. The scene also has its own shorter timeout that
    // intentionally switches to the photographic fallback.
    hardTimeout = window.setTimeout(reveal, 11_000);
    if (document.documentElement.dataset.nomaHeroReady) reveal();

    return () => {
      window.removeEventListener(NOMA_HERO_READY_EVENT, onReady);
      window.clearTimeout(hardTimeout);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
      document.body.style.overflow = previousOverflow.current;
      delete document.documentElement.dataset.nomaHeroReady;
    };
  }, []);

  useEffect(() => {
    if (phase !== "removed") return;
    document.body.style.overflow = previousOverflow.current;
  }, [phase]);

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
