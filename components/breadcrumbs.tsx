import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Navegacao estrutural" className="flex flex-wrap items-center gap-1 py-5 text-xs text-muted">
      <Link href="/" className="hover:text-brand">Inicio</Link>
      {items.map((item) => (
        <span key={`${item.label}-${item.href}`} className="inline-flex items-center gap-1">
          <ChevronRight size={13} aria-hidden="true" />
          {item.href ? <Link href={item.href} className="hover:text-brand">{item.label}</Link> : <span className="text-ink">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
