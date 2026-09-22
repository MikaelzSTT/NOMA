"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/home/noma-home.module.css";

const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";
const PLAYBACK_MEDIA = "(prefers-reduced-motion: no-preference)";

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotionMedia = window.matchMedia(REDUCED_MOTION_MEDIA);

    const syncPlayback = () => {
      if (reducedMotionMedia.matches) {
        video.pause();
        setIsReady(false);
        return;
      }

      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) setIsReady(true);
      if (document.hidden) {
        video.pause();
        return;
      }

      void video.play().catch(() => {
        // Autoplay can be denied by the browser; the neutral hero remains visible.
      });
    };

    document.addEventListener("visibilitychange", syncPlayback);
    reducedMotionMedia.addEventListener("change", syncPlayback);
    syncPlayback();

    return () => {
      document.removeEventListener("visibilitychange", syncPlayback);
      reducedMotionMedia.removeEventListener("change", syncPlayback);
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        className={`${styles.heroVideo} ${isReady ? styles.heroVideoReady : ""}`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onCanPlay={() => setIsReady(true)}
        onError={() => setIsReady(false)}
      >
        <source
          src="/videos/noma-hero-desktop.mp4"
          type="video/mp4"
          media={`(min-width: 641px) and ${PLAYBACK_MEDIA}`}
        />
        <source
          src="/videos/nomavideooppo.mp4"
          type="video/mp4"
          media={`(max-width: 640px) and ${PLAYBACK_MEDIA}`}
        />
      </video>
      <div
        className={`${styles.heroVideoLoading} ${isReady ? styles.heroVideoLoadingHidden : ""}`}
        aria-hidden="true"
      >
        <span />
      </div>
    </>
  );
}
