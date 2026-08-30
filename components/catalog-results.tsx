import { PackageSearch } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import type { Market } from "@/lib/market";
import { ProductCard } from "@/components/product-card";

export function CatalogResults({ products, market = products[0]?.market ?? "BR" }: { products: CatalogProduct[]; market?: Market }) {
  if (products.length === 0) {
    return (
      <div className="empty-state">
        <PackageSearch size={36} />
        <h2>{market === "US" ? "No products found" : "Nenhum produto encontrado"}</h2>
        <p>{market === "US" ? "Try removing filters or searching for another term." : "Tente remover alguns filtros ou buscar por outro termo."}</p>
      </div>
    );
  }
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} market={market} />)}</div>;
}
