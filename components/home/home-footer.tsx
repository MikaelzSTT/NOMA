import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./noma-home.module.css";

export function HomeFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.shell}>
        <div className={styles.footerMain}>
          <div>
            <Link href="#inicio" className={styles.footerMark} aria-label="Noma — início">
              NOMA<span>.</span>
            </Link>
            <p>Móveis, interiores e marcenaria<br />para uma vida mais presente.</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h2>Descubra</h2>
              <Link href="#ambientes">Ambientes</Link>
              <Link href="#colecoes">Coleções</Link>
              <Link href="#materiais">Materiais</Link>
              <Link href="#planejados">Sob medida</Link>
            </div>
            <div>
              <h2>Encontre</h2>
              <Link href="#contato">Showroom</Link>
              <Link href="#inspiracao">Journal</Link>
              <Link href="#sobre">Sobre a Noma</Link>
              <a href="mailto:ola@noma.example">
                Fale conosco <ArrowUpRight aria-hidden="true" size={13} />
              </a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>© {new Date().getFullYear()} Noma Interiores. Conceito demonstrativo.</p>
          <div>
            <span>São Paulo · Brasil</span>
            <Link href="#inicio">Voltar ao topo ↑</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
