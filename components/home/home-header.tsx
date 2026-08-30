import Link from "next/link";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { MarketSwitcher } from "@/components/market-switcher";
import type { Market } from "@/lib/market";
import styles from "./noma-home.module.css";

const links = [
  { href: "#ambientes", label: "Ambientes" },
  { href: "#colecoes", label: "Coleções" },
  { href: "#planejados", label: "Planejados" },
  { href: "#inspiracao", label: "Inspiração" },
  { href: "#sobre", label: "Sobre" },
];

export function HomeHeader({ market }: { market: Market }) {
  const isUS = market === "US";
  const navLinks = isUS
    ? [
        { href: "#ambientes", label: "Rooms" },
        { href: "#colecoes", label: "Collections" },
        { href: "#planejados", label: "Custom" },
        { href: "#inspiracao", label: "Inspiration" },
        { href: "#sobre", label: "About" },
      ]
    : links;
  return (
    <header
      className={styles.header}
      data-noma-header
      data-scrolled="false"
      data-menu-open="false"
    >
      <div className={styles.headerInner}>
        <Link href="#inicio" className={styles.wordmark} aria-label="Noma — início">
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
          <button type="button" aria-label="Pesquisar" className={styles.headerIcon}>
            <Search aria-hidden="true" size={18} />
          </button>
          <button type="button" aria-label="Minha conta" className={styles.headerIcon}>
            <UserRound aria-hidden="true" size={18} />
          </button>
          <button type="button" aria-label="Sacola, sem itens" className={styles.headerIcon}>
            <ShoppingBag aria-hidden="true" size={18} />
            <span className={styles.bagCount}>0</span>
          </button>
          <button
            type="button"
            aria-label="Abrir menu"
            aria-expanded="false"
            aria-controls="noma-mobile-menu"
            className={styles.menuToggle}
            data-menu-toggle
          >
            <Menu className={styles.menuIcon} aria-hidden="true" size={21} />
            <X className={styles.closeIcon} aria-hidden="true" size={21} />
          </button>
        </div>
      </div>

      <div className={styles.mobileMenu} id="noma-mobile-menu">
        <nav aria-label="Navegação móvel">
          {navLinks.map((link, index) => (
            <Link key={link.href} href={link.href} data-menu-link>
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
