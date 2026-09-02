"use client";

import { useEffect } from "react";

export function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-noma-home]");
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      if (!reduceMotion.matches) {
        root.querySelectorAll<HTMLElement>("[data-parallax]").forEach((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;
          const strength = Number(element.dataset.parallax ?? 30);
          const position = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
          element.style.transform = `translate3d(0, ${(-position * strength).toFixed(2)}px, 0) scale(1.04)`;
        });
      }
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const revealItems = root.querySelectorAll<HTMLElement>("[data-reveal]");
    let observer: IntersectionObserver | undefined;

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => (item.dataset.visible = "true"));
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const target = entry.target as HTMLElement;
            target.dataset.visible = "true";
            observer?.unobserve(target);
          });
        },
        { threshold: 0.14, rootMargin: "0px 0px -7%" },
      );
      revealItems.forEach((item) => observer?.observe(item));
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    reduceMotion.addEventListener("change", requestUpdate);
    update();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      reduceMotion.removeEventListener("change", requestUpdate);
    };
  }, []);

  return null;
}
