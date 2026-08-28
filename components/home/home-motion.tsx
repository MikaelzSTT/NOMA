"use client";

import { useEffect } from "react";

export function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-noma-home]");
    if (!root) return;

    const header = document.querySelector<HTMLElement>("[data-noma-header]");
    const menuButton = header?.querySelector<HTMLButtonElement>("[data-menu-toggle]");
    const menuLinks = header?.querySelectorAll<HTMLAnchorElement>("[data-menu-link]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const previousOverflow = document.body.style.overflow;
    let frame = 0;

    const closeMenu = () => {
      if (!header || !menuButton) return;
      header.dataset.menuOpen = "false";
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Abrir menu");
      document.body.style.overflow = previousOverflow;
    };

    const toggleMenu = () => {
      if (!header || !menuButton) return;
      const isOpen = header.dataset.menuOpen === "true";
      header.dataset.menuOpen = String(!isOpen);
      menuButton.setAttribute("aria-expanded", String(!isOpen));
      menuButton.setAttribute("aria-label", isOpen ? "Abrir menu" : "Fechar menu");
      document.body.style.overflow = isOpen ? previousOverflow : "hidden";
    };

    const update = () => {
      frame = 0;
      if (header) header.dataset.scrolled = String(window.scrollY > 48);

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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    menuButton?.addEventListener("click", toggleMenu);
    menuLinks?.forEach((link) => link.addEventListener("click", closeMenu));
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("keydown", onKeyDown);
    reduceMotion.addEventListener("change", requestUpdate);
    update();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      menuButton?.removeEventListener("click", toggleMenu);
      menuLinks?.forEach((link) => link.removeEventListener("click", closeMenu));
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("keydown", onKeyDown);
      reduceMotion.removeEventListener("change", requestUpdate);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return null;
}
