import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

export function ProductSection({
  title,
  eyebrow,
  products,
  href = "/buscar",
}: {
  title: string;
  eyebrow?: string;
  products: CatalogProduct[];
  href?: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        <Link href={href} className="text-link">
          Ver todos <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="product-grid">
        {products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  );
}
