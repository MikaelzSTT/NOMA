import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { MARKET_CONFIG, productPath, type Market } from "@/lib/market";
import { formatMoney } from "@/lib/utils";
import styles from "./noma-home.module.css";

export function NomaProductCard({ product, market, index = 0 }: { product: CatalogProduct; market: Market; index?: number }) {
  const image = product.images[0];
  const config = MARKET_CONFIG[market];
  const isUS = market === "US";
  const discountLabel = getDiscountLabel(product.sellingPrice, product.compareAtPrice, product.discountPercent);
  const badge = product.attributes.badge ? String(product.attributes.badge) : null;

  return (
    <article
      className={styles.storeProductCard}
      data-reveal
      style={{ transitionDelay: `${Math.min(index * 45, 180)}ms` }}
    >
      <Link href={productPath(market, product.slug)} aria-label={`${isUS ? "View" : "Ver"} ${product.title}`}>
        <div
          className={styles.storeProductImage}
          role="img"
          aria-label={image?.alt ?? product.title}
          style={
            {
              "--product-image": `url("${image?.url ?? ""}")`,
              "--product-x": image?.url === "/images/noma/products.webp" ? `${Number(product.attributes.spriteColumn ?? 0) * 50}%` : "center",
              "--product-y": image?.url === "/images/noma/products.webp" ? `${Number(product.attributes.spriteRow ?? 0) * 100}%` : "center",
              "--product-size": image?.url === "/images/noma/products.webp" ? "300% 200%" : "cover",
            } as CSSProperties
          }
        >
          {discountLabel && <span className={styles.storeDiscount}>{discountLabel}</span>}
          {badge && <span className={styles.storeBadge}>{badge}</span>}
        </div>
        <div className={styles.storeProductBody}>
          <p className={styles.storeCategory}>{product.category.name}</p>
          <h3>{product.title}</h3>
          <div className={styles.storePriceRow}>
            {product.sellingPrice ? (
              <strong>{formatMoney(product.sellingPrice, product.currency, config.locale)}</strong>
            ) : (
              <strong>{isUS ? "Upon request" : "Sob consulta"}</strong>
            )}
            {product.compareAtPrice && product.sellingPrice && product.compareAtPrice > product.sellingPrice && (
              <span>{formatMoney(product.compareAtPrice, product.currency, config.locale)}</span>
            )}
          </div>
          {product.estimatedDelivery && <p className={styles.storeDelivery}>{product.estimatedDelivery}</p>}
          <span className={styles.storeCardCta}>
            {isUS ? "View product" : "Ver produto"} <ArrowUpRight aria-hidden="true" size={14} />
          </span>
        </div>
      </Link>
    </article>
  );
}

function getDiscountLabel(sellingPrice: number | null, compareAtPrice: number | null, discountPercent: number | null) {
  if (discountPercent && discountPercent > 0) return `${Math.round(discountPercent)}% OFF`;
  if (!sellingPrice || !compareAtPrice || compareAtPrice <= sellingPrice) return null;
  return `${Math.round(((compareAtPrice - sellingPrice) / compareAtPrice) * 100)}% OFF`;
}
