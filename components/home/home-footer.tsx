import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { marketHomePath, type Market } from "@/lib/market";
import styles from "./noma-home.module.css";

export function HomeFooter({ market = "BR", embedded = true }: { market?: Market; embedded?: boolean }) {
  const isUS = market === "US";
  const homePath = marketHomePath(market);
  const sectionHref = (anchor: string) => `${embedded ? "" : homePath}${anchor}`;
  return (
    <footer className={styles.footer}>
      <div className={styles.shell}>
        <div className={styles.footerMain}>
          <div>
            <Link href={sectionHref("#inicio")} className={styles.footerMark} aria-label="Noma — início">
              NOMA<span>.</span>
            </Link>
            <p>{isUS ? <>Furniture, interiors, and custom millwork<br />for a more present life.</> : <>Móveis, interiores e marcenaria<br />para uma vida mais presente.</>}</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h2>{isUS ? "Discover" : "Descubra"}</h2>
              <Link href={sectionHref("#ambientes")}>{isUS ? "Rooms" : "Ambientes"}</Link>
              <Link href={sectionHref("#colecoes")}>{isUS ? "Collections" : "Coleções"}</Link>
              <Link href={sectionHref("#materiais")}>{isUS ? "Materials" : "Materiais"}</Link>
              <Link href={sectionHref("#planejados")}>{isUS ? "Custom" : "Sob medida"}</Link>
            </div>
            <div>
              <h2>{isUS ? "Find" : "Encontre"}</h2>
              <Link href={sectionHref("#contato")}>Showroom</Link>
              <Link href={sectionHref("#inspiracao")}>Journal</Link>
              <Link href={sectionHref("#sobre")}>{isUS ? "About Noma" : "Sobre a Noma"}</Link>
              <a href="mailto:ola@noma.example">
                {isUS ? "Contact us" : "Fale conosco"} <ArrowUpRight aria-hidden="true" size={13} />
              </a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>© {new Date().getFullYear()} Noma Interiores. {isUS ? "Demonstration concept." : "Conceito demonstrativo."}</p>
          <div>
            <span>São Paulo · Brasil</span>
            <Link href={sectionHref("#inicio")}>{isUS ? "Back to top" : "Voltar ao topo"} ↑</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
