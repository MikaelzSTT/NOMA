import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, PackageCheck, Store } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductGallery } from "@/components/product-gallery";
import { ProductSection } from "@/components/product-section";
import { Rating } from "@/components/rating";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { absoluteUrl, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const description = product.shortDescription ?? `Conheça ${product.title}.`;
  const image = product.images[0]?.url;
  return {
    title: product.title,
    description,
    alternates: { canonical: absoluteUrl(`/produto/${product.slug}`) },
    openGraph: {
      type: "website",
      title: product.title,
      description,
      url: absoluteUrl(`/produto/${product.slug}`),
      images: image ? [{ url: image, alt: product.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title: product.title, description, images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const related = await getRelatedProducts(product);
  const discount = product.discountPercent ? Math.round(Number(product.discountPercent)) : 0;
  const specs = Object.entries(product.attributes).filter(([key]) => !["badge", "spriteColumn", "spriteRow"].includes(key));
  const sprite = product.images[0]?.url === "/images/noma/products.webp"
    ? { column: Number(product.attributes.spriteColumn ?? 0), row: Number(product.attributes.spriteRow ?? 0) }
    : undefined;
  const jsonLd = buildProductSchema(product);

  return (
    <div className="container pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={[{ label: product.category.name, href: `/categoria/${product.category.slug}` }, { label: product.title }]} />
      <section className="product-detail">
        <ProductGallery images={product.images} name={product.title} sprite={sprite} />
        <div className="product-summary">
          <p className="eyebrow">{product.brand?.name ?? product.category.name}</p>
          <h1>{product.title}</h1>
          <div className="mt-3"><Rating value={product.rating ? Number(product.rating) : null} count={product.reviewCount} /></div>
          <p className="mt-5 text-sm leading-6 text-muted">{product.shortDescription}</p>
          <div className="my-6 border-y border-border py-5">
            {product.compareAtPrice && product.sellingPrice && product.compareAtPrice > product.sellingPrice && (
              <p className="text-sm text-muted"><span className="line-through">{formatMoney(product.compareAtPrice, product.currency)}</span>{discount > 0 && <strong className="ml-2 text-coral">Economize {discount}%</strong>}</p>
            )}
            {product.sellingPrice ? <p className="mt-1 text-4xl font-black text-ink">{formatMoney(product.sellingPrice, product.currency)}</p> : <p className="text-xl font-bold text-muted">Preco indisponivel</p>}
            {product.installmentText && <p className="mt-2 text-sm text-muted">{product.installmentText}</p>}
          </div>
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><Store size={17} className="text-brand" /><span>Fornecedor <strong>{product.supplier.name}</strong></span></p>
            <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-brand" /><span>{availabilityLabel(product.availability)}</span></p>
            <p className="flex items-center gap-2"><PackageCheck size={17} className="text-brand" /><span>{product.stock} unidade(s) em estoque</span></p>
            {product.estimatedDelivery && <p className="flex items-center gap-2 text-muted"><Clock3 size={17} /><span>Entrega estimada: {product.estimatedDelivery}</span></p>}
          </div>
          {product.variants.length > 0 && <div className="mt-6"><p className="mb-2 text-xs font-bold uppercase text-muted">Variantes</p><div className="flex flex-wrap gap-2">{product.variants.map((variant) => <span key={variant.id} className="rounded-sm border border-border px-3 py-2 text-sm font-semibold">{variant.title}{variant.stock === 0 ? " · indisponível" : ""}</span>)}</div></div>}
          <button disabled className="button-buy opacity-60">Compra disponível em uma próxima etapa</button>
        </div>
      </section>

      <section className="content-band">
        <div>
          <p className="eyebrow">Sobre o produto</p>
          <h2>Descricao</h2>
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted">{product.description ?? product.shortDescription ?? "Descricao nao fornecida pela fonte."}</p>
        </div>
        {specs.length > 0 && (
          <div>
            <p className="eyebrow">Detalhes</p>
            <h2>Especificacoes</h2>
            <dl className="mt-4 divide-y divide-border border-y border-border">
              {specs.map(([key, value]) => <div key={key} className="grid grid-cols-2 gap-4 py-3 text-sm"><dt className="text-muted">{key}</dt><dd className="font-semibold text-ink">{String(value)}</dd></div>)}
            </dl>
          </div>
        )}
      </section>

      <ProductSection title="Produtos relacionados" eyebrow="Voce tambem pode gostar" products={related} href={`/categoria/${product.category.slug}`} />
    </div>
  );
}

function availabilityLabel(value: string) {
  return { AVAILABLE: "Disponível", OUT_OF_STOCK: "Indisponível no momento", PREORDER: "Disponível em pré-venda", UNKNOWN: "Disponibilidade não informada", REMOVED: "Produto removido" }[value] ?? "Disponibilidade não informada";
}

function buildProductSchema(product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>) {
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
      url: absoluteUrl(`/produto/${product.slug}`),
      availability: product.availability === "AVAILABLE" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Noma" },
    };
  }
  return schema;
}
