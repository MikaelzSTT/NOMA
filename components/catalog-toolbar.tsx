import type { ProductFilters } from "@/lib/validation/product";
import { MARKET_CONFIG, type Market } from "@/lib/market";
import { SortSelect } from "@/components/sort-select";

export function CatalogToolbar({ total, filters, market = "BR" }: { total: number; filters: ProductFilters; market?: Market }) {
  const config = MARKET_CONFIG[market];
  return (
    <div className="catalog-toolbar">
      <p className="text-sm text-muted"><strong className="text-ink">{total.toLocaleString(config.locale)}</strong> {market === "US" ? "products" : "produtos"}</p>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted">
        {market === "US" ? "Sort by" : "Ordenar por"}
        <SortSelect value={filters.sort} market={market} />
      </label>
    </div>
  );
}
