"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { MarketSwitcher } from "@/components/market-switcher";
import { marketHomePath, searchPath, type Market } from "@/lib/market";
import styles from "./noma-home.module.css";

const links = [
  { href: "#ambientes", label: "Ambientes" },
  { href: "#colecoes", label: "Coleções" },
  { href: "#planejados", label: "Planejados" },
  { href: "#inspiracao", label: "Inspiração" },
  { href: "#sobre", label: "Sobre" },
];

export function HomeHeader({
  market,
  surface = "overlay",
  storeHeader = false,
}: {
  market: Market;
  surface?: "overlay" | "solid";
  storeHeader?: boolean;
}) {
  const isUS = market === "US";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const homePath = marketHomePath(market);
  const anchorPrefix = surface === "overlay" ? "" : homePath;
  const navLinks = isUS
    ? [
        { href: `${anchorPrefix}#ambientes`, label: "Rooms" },
        { href: `${anchorPrefix}#colecoes`, label: "Collections" },
        { href: `${anchorPrefix}#planejados`, label: "Custom" },
        { href: `${anchorPrefix}#inspiracao`, label: "Inspiration" },
        { href: `${anchorPrefix}#sobre`, label: "About" },
      ]
    : links.map((link) => ({ ...link, href: `${anchorPrefix}${link.href}` }));

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 48);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  if (storeHeader && pathname === homePath) return null;

  return (
    <header
      className={styles.header}
      data-noma-header
      data-store-header={storeHeader ? "" : undefined}
      data-surface={surface}
      data-scrolled={scrolled}
      data-menu-open={menuOpen}
    >
      <div className={styles.headerInner}>
        <Link href={surface === "overlay" ? "#inicio" : homePath} className={styles.wordmark} aria-label="Noma — início">
          NOMA<span aria-hidden="true">.</span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Navegação principal">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions} aria-label="Ações rápidas">
          <MarketSwitcher market={market} className={styles.marketSelect} />
          <Link href={searchPath(market)} aria-label={isUS ? "Search" : "Pesquisar"} className={styles.headerIcon}>
            <Search aria-hidden="true" size={18} />
          </Link>
          <button type="button" aria-label={isUS ? "My account" : "Minha conta"} className={styles.headerIcon}>
            <UserRound aria-hidden="true" size={18} />
          </button>
          <button type="button" aria-label={isUS ? "Bag, no items" : "Sacola, sem itens"} className={styles.headerIcon}>
            <ShoppingBag aria-hidden="true" size={18} />
            <span className={styles.bagCount}>0</span>
          </button>
          <button
            type="button"
            aria-label={menuOpen ? (isUS ? "Close menu" : "Fechar menu") : (isUS ? "Open menu" : "Abrir menu")}
            aria-expanded={menuOpen}
            aria-controls="noma-mobile-menu"
            className={styles.menuToggle}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Menu className={styles.menuIcon} aria-hidden="true" size={21} />
            <X className={styles.closeIcon} aria-hidden="true" size={21} />
          </button>
        </div>
      </div>

      <div className={styles.mobileMenu} id="noma-mobile-menu">
        <nav aria-label="Navegação móvel">
          {navLinks.map((link, index) => (
            <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
              <span>0{index + 1}</span>
              {link.label}
            </Link>
          ))}
        </nav>
        <p>{isUS ? "Interiors, furniture, and custom millwork." : "Interiores, mobiliário e marcenaria sob medida."}</p>
      </div>
    </header>
  );
}
