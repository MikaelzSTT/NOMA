"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { signalNomaHeroReady, type NomaHeroReadyDetail } from "./home-entry-gate";
import styles from "./noma-home.module.css";

const ShowroomScene = dynamic(
  () => import("./showroom-scene").then((module) => module.ShowroomScene),
  { ssr: false },
);

const rooms = [
  { number: "01", name: "Estar", detail: "Volumes para conviver" },
  { number: "02", name: "Suíte", detail: "Intimidade e textura" },
  { number: "03", name: "Planejados", detail: "Precisão que integra" },
];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (from: number, to: number, value: number) => {
  const progress = clamp((value - from) / (to - from));
  return progress * progress * (3 - 2 * progress);
};

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ImmersiveHouse() {
  const sectionRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const activeRoomRef = useRef(0);
  const [activeRoom, setActiveRoom] = useState(0);
  const [compact, setCompact] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sceneActive, setSceneActive] = useState(true);
  const [sceneEnabled, setSceneEnabled] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const completionRef = useRef(false);
  const fallbackLockedRef = useRef(false);
  const fallbackReasonRef = useRef<NomaHeroReadyDetail["reason"]>("scene-error");

  const finishEntry = useCallback((detail: NomaHeroReadyDetail) => {
    if (completionRef.current) return;
    completionRef.current = true;
    signalNomaHeroReady(detail);
  }, []);

  const activateFallback = useCallback((reason: NonNullable<NomaHeroReadyDetail["reason"]>) => {
    if (completionRef.current) return;
    fallbackLockedRef.current = true;
    fallbackReasonRef.current = reason;
    setSceneEnabled(false);
    setFallbackEnabled(true);
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactViewport = window.matchMedia("(max-width: 820px)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const testCanvas = document.createElement("canvas");
    const supportsWebGl = Boolean(
      window.WebGLRenderingContext &&
        (testCanvas.getContext("webgl2") || testCanvas.getContext("webgl")),
    );

    const updatePreferences = () => {
      setCompact(compactViewport.matches);
      setReducedMotion(reduceMotion.matches);
      if (fallbackLockedRef.current) return;
      if (!supportsWebGl) {
        activateFallback("unsupported");
      } else if (connection?.saveData) {
        activateFallback("save-data");
      } else {
        setSceneEnabled(true);
      }
    };

    const initialFrame = window.requestAnimationFrame(updatePreferences);

    reduceMotion.addEventListener("change", updatePreferences);
    compactViewport.addEventListener("change", updatePreferences);

    return () => {
      window.cancelAnimationFrame(initialFrame);
      reduceMotion.removeEventListener("change", updatePreferences);
      compactViewport.removeEventListener("change", updatePreferences);
    };
  }, [activateFallback]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => setSceneActive(entry.isIntersecting),
      { rootMargin: "120px 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;

    const update = () => {
      frame = 0;

      if (reducedMotion) {
        progressRef.current = 0;
        section.style.setProperty("--house-progress", "0");
        if (heroRef.current) {
          heroRef.current.style.opacity = "1";
          heroRef.current.style.transform = "none";
          heroRef.current.style.pointerEvents = "auto";
        }
        if (activeRoomRef.current !== 0) {
          activeRoomRef.current = 0;
          setActiveRoom(0);
        }
        return;
      }

      const rect = section.getBoundingClientRect();
      const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const progress = clamp(-rect.top / distance);
      const nextRoom = progress < 0.36 ? 0 : progress < 0.7 ? 1 : 2;

      progressRef.current = progress;
      section.style.setProperty("--house-progress", progress.toFixed(4));

      if (heroRef.current) {
        const departure = smoothstep(0.055, 0.2, progress);
        heroRef.current.style.opacity = String(1 - departure);
        heroRef.current.style.transform = `translate3d(0, ${(-departure * 5).toFixed(2)}rem, 0)`;
        heroRef.current.style.pointerEvents = departure > 0.9 ? "none" : "auto";
      }

      if (nextRoom !== activeRoomRef.current) {
        activeRoomRef.current = nextRoom;
        setActiveRoom(nextRoom);
      }
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    update();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!sceneEnabled || sceneReady) return;
    const timeout = window.setTimeout(() => activateFallback("scene-timeout"), 9_000);
    return () => window.clearTimeout(timeout);
  }, [activateFallback, sceneEnabled, sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;
    const reveal = window.setTimeout(() => finishEntry({ mode: "3d" }), 180);
    return () => window.clearTimeout(reveal);
  }, [finishEntry, sceneReady]);

  useEffect(() => {
    if (!fallbackEnabled) return;
    const reveal = window.setTimeout(
      () => finishEntry({ mode: "fallback", reason: fallbackReasonRef.current }),
      1_200,
    );
    return () => window.clearTimeout(reveal);
  }, [fallbackEnabled, finishEntry]);

  const room = rooms[activeRoom];
  return (
    <section
      className={styles.houseScroll}
      data-house-scroll
      data-scene-ready={sceneReady}
      ref={sectionRef}
      id="inicio"
    >
      <div className={styles.houseStage}>
        <div className={styles.sceneFallback}>
          {fallbackEnabled ? (
            <Image
              src="/images/noma/living-room.webp"
              alt="Sala contemporânea Noma em tons naturais"
              fill
              sizes="(max-aspect-ratio: 3/4) 178vh, 100vw"
              onLoad={() => finishEntry({ mode: "fallback", reason: fallbackReasonRef.current })}
              onError={() => finishEntry({ mode: "fallback", reason: fallbackReasonRef.current })}
            />
          ) : null}
        </div>

        <div className={styles.sceneCanvas} aria-hidden="true">
          {sceneEnabled ? (
            <SceneErrorBoundary onError={() => activateFallback("scene-error")}>
              <ShowroomScene
                active={sceneActive}
                activeRoom={activeRoom}
                compact={compact}
                progress={progressRef}
                reducedMotion={reducedMotion}
                onReady={() => setSceneReady(true)}
              />
            </SceneErrorBoundary>
          ) : null}
        </div>

        <div className={styles.houseShade} aria-hidden="true" />
        <div className={styles.filmGrain} aria-hidden="true" />

        <div className={styles.heroContent} data-house-hero ref={heroRef}>
          <p className={styles.heroEyebrow}>Interiores · Mobiliário · Planejados</p>
          <h1>
            Design em
            <br />
            escala real.
          </h1>
          <p className={styles.heroIntro}>
            Ambientes completos, desenhados com precisão para a forma como você vive.
          </p>
          <div className={styles.heroActions}>
            <Link href="#ambientes" className={styles.lightButton}>
              Explorar ambientes <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <Link href="#colecao-produtos" className={styles.ghostButton}>
              Ver coleção
            </Link>
          </div>
        </div>

        <div className={styles.sceneMeta} aria-hidden="true">
          <div className={styles.progressTrack}>
            <span />
          </div>
          <div className={styles.sceneCaption} key={room.number}>
            <span>{room.number} / 03</span>
            <strong>{room.name}</strong>
            <small>{room.detail}</small>
          </div>
        </div>

        <div className={styles.spatialNote} aria-hidden="true">
          <span>Experiência espacial</span>
          <i />
          <span>São Paulo · 2026</span>
        </div>

        <div className={styles.scrollCue}>
          <span>Percorra o espaço</span>
          <ArrowDown aria-hidden="true" size={16} />
        </div>
      </div>
    </section>
  );
}
