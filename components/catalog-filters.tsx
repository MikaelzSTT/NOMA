import { Filter } from "lucide-react";
import type { ProductFilters } from "@/lib/validation/product";

interface Facet { name: string; slug: string; _count: { products: number } }

export function CatalogFilters({
  filters,
  brands,
  suppliers,
  query,
}: {
  filters: ProductFilters;
  brands: Facet[];
  suppliers: Facet[];
  query?: string;
}) {
  return (
    <aside>
      <details className="filters-panel" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-extrabold text-ink">
          <Filter size={18} /> Filtros
        </summary>
        <form className="mt-5 space-y-6" method="get">
          {query && <input type="hidden" name="q" value={query} />}
          <fieldset>
            <legend className="filter-title">Faixa de preco</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="field-label">Minimo<input name="minPrice" type="number" min="0" step="10" defaultValue={filters.minPrice} placeholder="R$ 0" /></label>
              <label className="field-label">Maximo<input name="maxPrice" type="number" min="0" step="10" defaultValue={filters.maxPrice} placeholder="R$ 5.000" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend className="filter-title">Marca</legend>
            <div className="filter-options">
              {brands.map((brand) => <CheckOption key={brand.slug} name="brand" value={brand.slug} label={brand.name} count={brand._count.products} checked={filters.brand.includes(brand.slug)} />)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="filter-title">Fornecedor</legend>
            <div className="filter-options">
              {suppliers.map((supplier) => <CheckOption key={supplier.slug} name="supplier" value={supplier.slug} label={supplier.name} count={supplier._count.products} checked={filters.supplier.includes(supplier.slug)} />)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="filter-title">Avaliacao minima</legend>
            <select name="minRating" defaultValue={filters.minRating ?? ""} className="select-field">
              <option value="">Qualquer avaliacao</option>
              {[4.5, 4, 3].map((rating) => <option key={rating} value={rating}>{rating}+ estrelas</option>)}
            </select>
          </fieldset>
          <fieldset>
            <legend className="filter-title">Desconto minimo</legend>
            <select name="minDiscount" defaultValue={filters.minDiscount ?? ""} className="select-field">
              <option value="">Qualquer desconto</option>
              {[10, 20, 30, 40].map((discount) => <option key={discount} value={discount}>{discount}% ou mais</option>)}
            </select>
          </fieldset>
          <label className="check-row"><input type="checkbox" name="available" value="true" defaultChecked={filters.available} /><span>Somente disponiveis</span></label>
          <button className="button-primary w-full" type="submit">Aplicar filtros</button>
        </form>
      </details>
    </aside>
  );
}

function CheckOption({ name, value, label, count, checked }: { name: string; value: string; label: string; count: number; checked: boolean }) {
  return (
    <label className="check-row">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} />
      <span className="min-w-0 flex-1 truncate">{label}</span><small>{count}</small>
    </label>
  );
}
