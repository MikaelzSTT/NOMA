"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./noma-home.module.css";

const SCROLL_END_TOLERANCE = 2;

export function SofaProductRail({ children, itemCount }: { children: ReactNode; itemCount: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(itemCount > 4);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateNavigation = () => {
      const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
      setCanScrollLeft(viewport.scrollLeft > SCROLL_END_TOLERANCE);
      setCanScrollRight(viewport.scrollLeft < maxScrollLeft - SCROLL_END_TOLERANCE);
    };

    const frame = window.requestAnimationFrame(updateNavigation);
    const resizeObserver = new ResizeObserver(updateNavigation);
    resizeObserver.observe(viewport);
    viewport.addEventListener("scroll", updateNavigation, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      viewport.removeEventListener("scroll", updateNavigation);
    };
  }, [itemCount]);

  const scrollByPage = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollBy({ left: direction * viewport.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={styles.sofaProductRail}>
      <div className={styles.sofaProductControls} aria-label="Navegação dos sofás">
        <button
          type="button"
          aria-label="Ver sofás anteriores"
          aria-controls="home-sofa-product-track"
          disabled={!canScrollLeft}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Ver próximos sofás"
          aria-controls="home-sofa-product-track"
          disabled={!canScrollRight}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className={styles.sofaProductViewport} ref={viewportRef}>
        <div
          className={`${styles.storeProductGrid} ${styles.sofaProductGrid}`}
          id="home-sofa-product-track"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
