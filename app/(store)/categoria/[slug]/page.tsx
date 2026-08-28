import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogResults } from "@/components/catalog-results";
import { CatalogToolbar } from "@/components/catalog-toolbar";
import { Pagination } from "@/components/pagination";
import { getCategory, listProducts } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/utils";
import { parseProductFilters, type RawSearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};
  const description = `Compare produtos de ${category.name}, filtre ofertas e acesse a loja responsavel pela venda.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: absoluteUrl(`/categoria/${slug}`) },
    openGraph: { title: `${category.name} | Vitrineo`, description, url: absoluteUrl(`/categoria/${slug}`), type: "website" },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const category = await getCategory(slug);
  if (!category) notFound();
  const filters = parseProductFilters(raw, { category: slug });
  const result = await listProducts(filters);

  return (
    <div className="container pb-10">
      <Breadcrumbs items={[{ label: category.name }]} />
      <div className="catalog-heading">
        <div><p className="eyebrow">Categoria</p><h1>{category.name}</h1></div>
        {category.description && <p>{category.description}</p>}
      </div>
      <div className="catalog-layout">
        <CatalogFilters filters={filters} brands={result.brands} suppliers={result.suppliers} />
        <div className="min-w-0">
          <CatalogToolbar total={result.total} filters={filters} />
          <CatalogResults products={result.products} />
          <Pagination pathname={`/categoria/${slug}`} raw={raw} current={filters.page} total={result.totalPages} />
        </div>
      </div>
    </div>
  );
}
