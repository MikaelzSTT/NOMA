import { PackageSearch } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

export function CatalogResults({ products }: { products: CatalogProduct[] }) {
  if (products.length === 0) {
    return (
      <div className="empty-state">
        <PackageSearch size={36} />
        <h2>Nenhum produto encontrado</h2>
        <p>Tente remover alguns filtros ou buscar por outro termo.</p>
      </div>
    );
  }
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
}
