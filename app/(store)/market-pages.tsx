import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Clock3, Store } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogResults } from "@/components/catalog-results";
import { CatalogToolbar } from "@/components/catalog-toolbar";
import { Pagination } from "@/components/pagination";
import { ProductGallery } from "@/components/product-gallery";
import { ProductSection } from "@/components/product-section";
import { ProductVariantSelector } from "@/components/product-variant-selector";
import { Rating } from "@/components/rating";
import { getCategory, getEquivalentProductSlug, getProductBySlug, getRelatedProducts, listProducts } from "@/lib/catalog";
import { MARKET_CONFIG, categoryPath, collectionsPath, productPath, searchPath, type Market } from "@/lib/market";
import { parseProductFilters, type RawSearchParams } from "@/lib/search-params";
import { absoluteUrl } from "@/lib/utils";

type ProductProps = { params: Promise<{ slug: string }> };
type CategoryProps = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };
type SearchProps = { searchParams: Promise<RawSearchParams> };

export async function productMetadata({ params, market }: ProductProps & { market: Market }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug({ slug, market });
  if (!product) return { robots: { index: false, follow: false } };
  const config = MARKET_CONFIG[market];
  const otherMarket = market === "BR" ? "US" : "BR";
  const otherSlug = await getEquivalentProductSlug({ productId: product.productId, market: otherMarket });
  const description = product.shortDescription ?? (market === "US" ? `Discover ${product.title}.` : `Conheça ${product.title}.`);
  const image = product.images[0]?.url;
  const languages = {
    [config.hreflang]: absoluteUrl(productPath(market, product.slug)),
    ...(otherSlug ? { [MARKET_CONFIG[otherMarket].hreflang]: absoluteUrl(productPath(otherMarket, otherSlug)) } : {}),
  };
  return {
    title: product.title,
    description,
    alternates: { canonical: absoluteUrl(productPath(market, product.slug)), languages },
    openGraph: {
      type: "website",
      title: product.title,
      description,
      locale: market === "US" ? "en_US" : "pt_BR",
      url: absoluteUrl(productPath(market, product.slug)),
      images: image ? [{ url: image, alt: product.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title: product.title, description, images: image ? [image] : undefined },
  };
}

export async function MarketProductPage({ params, market }: ProductProps & { market: Market }) {
  const { slug } = await params;
  const product = await getProductBySlug({ slug, market });
  if (!product) notFound();
  const related = await getRelatedProducts(product, market);
  const specs = Object.entries(product.attributes).filter(([key]) => !["badge", "spriteColumn", "spriteRow"].includes(key));
  const sprite = product.images[0]?.url === "/images/noma/products.webp"
    ? { column: Number(product.attributes.spriteColumn ?? 0), row: Number(product.attributes.spriteRow ?? 0) }
    : undefined;
  const jsonLd = buildProductSchema(product, market);
  const isUS = market === "US";

  return (
    <div className="container pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs market={market} items={[{ label: product.category.name, href: categoryPath(market, product.category.slug) }, { label: product.title }]} />
      <section className="product-detail">
        <ProductGallery images={product.images} name={product.title} sprite={sprite} />
        <div className="product-summary">
          <p className="eyebrow">{product.brand?.name ?? product.category.name}</p>
          <h1>{product.title}</h1>
          <div className="mt-3"><Rating value={product.rating ? Number(product.rating) : null} count={product.reviewCount} /></div>
          <p className="mt-5 text-sm leading-6 text-muted">{product.shortDescription}</p>
          <ProductVariantSelector
            market={market}
            variants={product.variants}
            fallback={{
              sellingPrice: product.sellingPrice,
              compareAtPrice: product.compareAtPrice,
              discountPercent: product.discountPercent,
              currency: product.currency,
              stock: product.stock,
              availability: product.availability,
            }}
          />
          {product.installmentText && <p className="mt-2 text-sm text-muted">{product.installmentText}</p>}
          <div className="mt-3 space-y-3 text-sm">
            <p className="flex items-center gap-2"><Store size={17} className="text-brand" /><span>{isUS ? "Supplier" : "Fornecedor"} <strong>{product.supplier.name}</strong></span></p>
            {product.estimatedDelivery && <p className="flex items-center gap-2 text-muted"><Clock3 size={17} /><span>{isUS ? "Estimated delivery" : "Entrega estimada"}: {product.estimatedDelivery}</span></p>}
          </div>
          <button disabled className="button-buy opacity-60">{isUS ? "Checkout coming in a future step" : "Compra disponível em uma próxima etapa"}</button>
        </div>
      </section>

      <section className="content-band">
        <div>
          <p className="eyebrow">{isUS ? "About the product" : "Sobre o produto"}</p>
          <h2>{isUS ? "Description" : "Descricao"}</h2>
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted">{product.description ?? product.shortDescription ?? (isUS ? "No description provided by the source." : "Descricao nao fornecida pela fonte.")}</p>
        </div>
        {specs.length > 0 && (
          <div>
            <p className="eyebrow">{isUS ? "Details" : "Detalhes"}</p>
            <h2>{isUS ? "Specifications" : "Especificacoes"}</h2>
            <dl className="mt-4 divide-y divide-border border-y border-border">
              {specs.map(([key, value]) => <div key={key} className="grid grid-cols-2 gap-4 py-3 text-sm"><dt className="text-muted">{key}</dt><dd className="font-semibold text-ink">{String(value)}</dd></div>)}
            </dl>
          </div>
        )}
      </section>

      <ProductSection market={market} title={isUS ? "Related products" : "Produtos relacionados"} eyebrow={isUS ? "You may also like" : "Voce tambem pode gostar"} products={related} href={categoryPath(market, product.category.slug)} />
    </div>
  );
}

export function searchMetadata(market: Market): Metadata {
  const isUS = market === "US";
  const path = searchPath(market);
  return {
    title: isUS ? "Search products" : "Buscar produtos",
    description: isUS ? "Search and compare products by name, brand, category, and description." : "Busque e compare produtos por nome, marca, categoria e descricao.",
    alternates: { canonical: absoluteUrl(path) },
    robots: { index: false, follow: true },
  };
}

export async function MarketSearchPage({ searchParams, market }: SearchProps & { market: Market }) {
  const raw = await searchParams;
  const filters = parseProductFilters(raw);
  const result = await listProducts(filters, market);
  const isUS = market === "US";
  const title = filters.q ? `${isUS ? "Results for" : "Resultados para"} "${filters.q}"` : isUS ? "All products" : "Todos os produtos";

  return (
    <div className="container pb-10">
      <Breadcrumbs market={market} items={[{ label: isUS ? "Search" : "Buscar" }]} />
      <div className="catalog-heading">
        <div><p className="eyebrow">{isUS ? "Catalog" : "Catalogo"}</p><h1>{title}</h1></div>
      </div>
      <div className="catalog-layout">
        <CatalogFilters market={market} filters={filters} brands={result.brands} suppliers={result.suppliers} query={filters.q} />
        <div className="min-w-0">
          <CatalogToolbar market={market} total={result.total} filters={filters} />
          <CatalogResults market={market} products={result.products} />
          <Pagination pathname={searchPath(market)} raw={raw} current={filters.page} total={result.totalPages} />
        </div>
      </div>
    </div>
  );
}

export async function categoryMetadata({ params, market }: CategoryProps & { market: Market }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug, market);
  if (!category) return { robots: { index: false, follow: false } };
  const description = market === "US"
    ? `Compare ${category.name} products, filter offers, and review the responsible source store.`
    : `Compare produtos de ${category.name}, filtre ofertas e acesse a loja responsavel pela venda.`;
  const path = categoryPath(market, slug);
  return {
    title: category.name,
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: { title: `${category.name} | Noma`, description, url: absoluteUrl(path), type: "website", locale: market === "US" ? "en_US" : "pt_BR" },
  };
}

export async function MarketCategoryPage({ params, searchParams, market }: CategoryProps & { market: Market }) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const category = await getCategory(slug, market);
  if (!category) notFound();
  const filters = parseProductFilters(raw, { category: slug });
  const result = await listProducts(filters, market);
  const isUS = market === "US";

  return (
    <div className="container pb-10">
      <Breadcrumbs market={market} items={[{ label: category.name }]} />
      <div className="catalog-heading">
        <div><p className="eyebrow">{isUS ? "Category" : "Categoria"}</p><h1>{category.name}</h1></div>
        {category.description && <p>{category.description}</p>}
      </div>
      <div className="catalog-layout">
        <CatalogFilters market={market} filters={filters} brands={result.brands} suppliers={result.suppliers} />
        <div className="min-w-0">
          <CatalogToolbar market={market} total={result.total} filters={filters} />
          <CatalogResults market={market} products={result.products} />
          <Pagination pathname={categoryPath(market, slug)} raw={raw} current={filters.page} total={result.totalPages} />
        </div>
      </div>
    </div>
  );
}

export function MarketCollectionsPage({ market }: { market: Market }) {
  redirect(`${market === "US" ? "/us" : "/br"}#colecoes`);
  return null;
}

export function collectionsMetadata(market: Market): Metadata {
  return {
    title: market === "US" ? "Collections" : "Coleções",
    alternates: { canonical: absoluteUrl(collectionsPath(market)) },
  };
}

function buildProductSchema(product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>, market: Market) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: product.sku,
    description: product.shortDescription ?? product.description,
    image: product.images.map((image) => image.url),
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    aggregateRating: product.rating && product.reviewCount
      ? { "@type": "AggregateRating", ratingValue: Number(product.rating), reviewCount: product.reviewCount }
      : undefined,
  };
  if (product.sellingPrice) {
    schema.offers = {
      "@type": "Offer",
      priceCurrency: product.currency,
      price: product.sellingPrice,
      url: absoluteUrl(productPath(market, product.slug)),
      availability: product.availability === "AVAILABLE" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Noma" },
    };
  }
  return schema;
}
