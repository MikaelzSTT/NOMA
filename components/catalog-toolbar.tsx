import type { ProductFilters } from "@/lib/validation/product";
import { SortSelect } from "@/components/sort-select";

export function CatalogToolbar({ total, filters }: { total: number; filters: ProductFilters }) {
  return (
    <div className="catalog-toolbar">
      <p className="text-sm text-muted"><strong className="text-ink">{total.toLocaleString("pt-BR")}</strong> produtos</p>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted">
        Ordenar por
        <SortSelect value={filters.sort} />
      </label>
    </div>
  );
}
