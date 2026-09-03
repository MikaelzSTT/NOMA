import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogResults } from "@/components/catalog-results";
import { CatalogToolbar } from "@/components/catalog-toolbar";
import { Pagination } from "@/components/pagination";
import { NomaProductCard } from "@/components/home/noma-product-card";
import { ProductDetailPurchase } from "@/components/product-detail-purchase";
import productStyles from "@/components/product-detail.module.css";
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
    <div className={productStyles.productPage}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className={productStyles.productShell}>
        <Breadcrumbs market={market} items={[{ label: product.category.name, href: categoryPath(market, product.category.slug) }, { label: product.title }]} />
        <ProductDetailPurchase
          productId={product.productId}
          productSlug={product.slug}
          images={product.images}
          name={product.title}
          brandLabel={product.brand?.name ?? product.category.name}
          shortDescription={product.shortDescription}
          rating={product.rating ? Number(product.rating) : null}
          reviewCount={product.reviewCount}
          supplierName={product.supplier.name}
          estimatedDelivery={product.estimatedDelivery}
          installmentText={product.installmentText}
          sprite={sprite}
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

        <section className={productStyles.contentBand}>
          <div>
            <p className={productStyles.sectionKicker}>{isUS ? "About the product" : "Sobre o produto"}</p>
            <h2>{isUS ? "Description" : "Descrição"}</h2>
            <p className={`${productStyles.longDescription} whitespace-pre-line`}>{product.description ?? product.shortDescription ?? (isUS ? "No description provided." : "Descrição não informada.")}</p>
          </div>
          {specs.length > 0 && (
            <div>
              <p className={productStyles.sectionKicker}>{isUS ? "Details" : "Detalhes"}</p>
              <h2>{isUS ? "Specifications" : "Especificações"}</h2>
              <dl className={productStyles.specifications}>
                {specs.map(([key, value]) => <div key={key} className={productStyles.specification}><dt>{key}</dt><dd>{String(value)}</dd></div>)}
              </dl>
            </div>
          )}
        </section>
      </div>

      {related.length > 0 && (
        <section className={productStyles.related}>
          <div className={productStyles.productShell}>
            <div className={productStyles.relatedHeading}>
              <div>
                <p className={productStyles.sectionKicker}>{isUS ? "You may also like" : "Você também pode gostar"}</p>
                <h2>{isUS ? "Related products" : "Produtos relacionados"}</h2>
              </div>
              <Link className={productStyles.relatedLink} href={categoryPath(market, product.category.slug)}>
                {isUS ? "View all" : "Ver todos"} <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </div>
            <div className={productStyles.relatedGrid}>
              {related.map((relatedProduct, index) => <NomaProductCard key={relatedProduct.id} product={relatedProduct} market={market} index={index} />)}
            </div>
          </div>
        </section>
      )}
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
