import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ImageIcon } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { formatMoney } from "@/lib/utils";
import { Rating } from "@/components/rating";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const image = product.images[0];
  const discount = product.discountPercent ? Math.round(Number(product.discountPercent)) : 0;
  const spriteColumn = Number(product.attributes.spriteColumn);
  const spriteRow = Number(product.attributes.spriteRow);
  const isSprite = image?.url === "/images/noma/products.webp" && Number.isFinite(spriteColumn) && Number.isFinite(spriteRow);

  return (
    <article className="product-card group">
      <Link href={`/produto/${product.slug}`} className="block" aria-label={product.title}>
        <div className="relative aspect-square overflow-hidden bg-white">
          {isSprite ? (
            <div
              role="img"
              aria-label={image.alt ?? product.title}
              className="h-full w-full bg-[length:300%_200%] bg-no-repeat transition-transform duration-300 group-hover:scale-[1.03]"
              style={{ backgroundImage: `url(${image.url})`, backgroundPosition: `${spriteColumn * 50}% ${spriteRow * 100}%` }}
            />
          ) : image ? (
            <Image
              src={image.url}
              alt={image.alt ?? product.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid h-full place-items-center text-border-strong">
              <ImageIcon size={36} aria-hidden="true" />
            </div>
          )}
          {discount > 0 && (
            <span className="absolute left-2 top-2 rounded-sm bg-coral px-2 py-1 text-xs font-extrabold text-white">
              -{discount}%
            </span>
          )}
          {product.attributes.badge && <span className="absolute bottom-2 left-2 rounded-sm bg-ink/85 px-2 py-1 text-[10px] font-bold uppercase text-white">{String(product.attributes.badge)}</span>}
        </div>
        <div className="flex min-h-48 flex-col p-3 sm:p-4">
          <p className="mb-1 text-xs font-semibold text-brand">{product.category.name}</p>
          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-ink">{product.title}</h3>
          <div className="mt-2"><Rating value={product.rating ? Number(product.rating) : null} count={product.reviewCount} /></div>
          <div className="mt-auto pt-3">
            {product.compareAtPrice && product.sellingPrice && product.compareAtPrice > product.sellingPrice && (
              <p className="text-xs text-muted line-through">{formatMoney(product.compareAtPrice, product.currency)}</p>
            )}
            {product.sellingPrice ? (
              <p className="text-lg font-extrabold text-ink sm:text-xl">{formatMoney(product.sellingPrice, product.currency)}</p>
            ) : (
              <p className="text-sm font-bold text-muted">Preco indisponivel</p>
            )}
            <p className="mt-1 flex items-center gap-1 text-xs font-bold text-brand">
              Ver oferta <ArrowUpRight size={13} aria-hidden="true" />
            </p>
          </div>
        </div>
      </Link>
    </article>
  );
}
