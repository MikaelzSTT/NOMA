import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogResults } from "@/components/catalog-results";
import { CatalogToolbar } from "@/components/catalog-toolbar";
import { Pagination } from "@/components/pagination";
import { listProducts } from "@/lib/catalog";
import { parseProductFilters, type RawSearchParams } from "@/lib/search-params";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar produtos",
  description: "Busque e compare produtos por nome, marca, categoria e descricao.",
  alternates: { canonical: absoluteUrl("/buscar") },
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const filters = parseProductFilters(raw);
  const result = await listProducts(filters);
  const title = filters.q ? `Resultados para “${filters.q}”` : "Todos os produtos";

  return (
    <div className="container pb-10">
      <Breadcrumbs items={[{ label: "Buscar" }]} />
      <div className="catalog-heading">
        <div><p className="eyebrow">Catalogo</p><h1>{title}</h1></div>
      </div>
      <div className="catalog-layout">
        <CatalogFilters filters={filters} brands={result.brands} suppliers={result.suppliers} query={filters.q} />
        <div className="min-w-0">
          <CatalogToolbar total={result.total} filters={filters} />
          <CatalogResults products={result.products} />
          <Pagination pathname="/buscar" raw={raw} current={filters.page} total={result.totalPages} />
        </div>
      </div>
    </div>
  );
}
