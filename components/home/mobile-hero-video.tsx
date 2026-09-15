"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/home/noma-home.module.css";

const MOBILE_HERO_MEDIA = "(max-width: 640px)";
const MOBILE_HERO_SOURCE_MEDIA = `${MOBILE_HERO_MEDIA} and (prefers-reduced-motion: no-preference)`;

export function MobileHeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const mobileMedia = window.matchMedia(MOBILE_HERO_MEDIA);
    const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncPlayback = () => {
      if (!mobileMedia.matches || reducedMotionMedia.matches) {
        video.pause();
        setIsPlaying(false);
        return;
      }

      if (document.hidden) {
        video.pause();
        return;
      }

      if (!video.ended) {
        void video.play().catch(() => setIsPlaying(false));
      }
    };

    document.addEventListener("visibilitychange", syncPlayback);
    mobileMedia.addEventListener("change", syncPlayback);
    reducedMotionMedia.addEventListener("change", syncPlayback);
    syncPlayback();

    return () => {
      document.removeEventListener("visibilitychange", syncPlayback);
      mobileMedia.removeEventListener("change", syncPlayback);
      reducedMotionMedia.removeEventListener("change", syncPlayback);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={`${styles.mobileHeroVideo} ${isPlaying ? styles.mobileHeroVideoPlaying : ""}`}
      autoPlay
      muted
      playsInline
      preload="metadata"
      poster="/images/noma/living-room.webp"
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setIsPlaying(true)}
      onError={() => setIsPlaying(false)}
    >
      <source
        src="/videos/noma-hero-mobile.mp4"
        type="video/mp4"
        media={MOBILE_HERO_SOURCE_MEDIA}
      />
    </video>
  );
}
