import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, ShieldCheck, Truck } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { MARKET_CONFIG, productPath, type Market } from "@/lib/market";
import { formatMoney } from "@/lib/utils";
import styles from "./noma-home.module.css";

export function NomaProductCard({
  product,
  market,
  index = 0,
  variant = "standard",
}: {
  product: CatalogProduct;
  market: Market;
  index?: number;
  variant?: "standard" | "featured" | "landscape" | "square";
}) {
  const image = product.images[0];
  const useSprite = image?.url === "/images/noma/products.webp";
  const config = MARKET_CONFIG[market];
  const isUS = market === "US";
  const isEditorial = variant !== "standard";
  const layoutClass = variant === "landscape"
    ? styles.landscapeProductCard
    : variant === "square"
      ? styles.squareProductCard
      : "";
  const discountLabel = getDiscountLabel(product.sellingPrice, product.compareAtPrice, product.discountPercent);
  const badge = product.attributes.badge ? String(product.attributes.badge) : null;
  const savings = product.sellingPrice && product.compareAtPrice && product.compareAtPrice > product.sellingPrice
    ? product.compareAtPrice - product.sellingPrice
    : null;
  const href = productPath(market, product.slug);

  return (
    <article
      className={`${styles.storeProductCard}${isEditorial ? ` ${styles.featuredProductCard}` : ""}${layoutClass ? ` ${layoutClass}` : ""}`}
      data-product-card-layout={variant === "landscape" || variant === "square" ? variant : undefined}
      data-reveal
      style={{ transitionDelay: `${Math.min(index * 45, 180)}ms` }}
    >
      <Link className={styles.storeProductLink} href={href} aria-label={`${isUS ? "View" : "Ver"} ${product.title}`}>
        <div
          className={styles.storeProductImage}
          data-css-image={useSprite ? "true" : undefined}
          role={useSprite ? "img" : undefined}
          aria-label={useSprite ? (image?.alt ?? product.title) : undefined}
          style={
            useSprite
              ? ({
                  "--product-image": `url("${image.url}")`,
                  "--product-x": `${Number(product.attributes.spriteColumn ?? 0) * 50}%`,
                  "--product-y": `${Number(product.attributes.spriteRow ?? 0) * 100}%`,
                  "--product-size": "300% 200%",
                } as CSSProperties)
              : undefined
          }
        >
          {!useSprite && image?.url ? (
            <Image
              src={image.url}
              alt={image.alt ?? product.title}
              fill
              sizes={variant === "square"
                ? "(max-width: 640px) 44vw, (max-width: 900px) 45vw, (max-width: 1596px) 31vw, 484px"
                : isEditorial
                  ? "(max-width: 640px) 44vw, (max-width: 900px) 45vw, (max-width: 1596px) 23vw, 360px"
                  : "(max-width: 720px) 84vw, (max-width: 1180px) 31vw, 18vw"}
              quality={isEditorial ? 75 : 58}
              loading="lazy"
            />
          ) : null}
          {!isEditorial && (discountLabel || badge) && (
            <div className={styles.storeImageBadges}>
              {discountLabel && <span className={styles.storeDiscount}>{discountLabel}</span>}
              {badge && <span className={styles.storeBadge}>{badge}</span>}
            </div>
          )}
        </div>
        <div className={styles.storeProductBody}>
          {isEditorial ? (
            <>
              <h3>{product.title}</h3>
              <div className={styles.storePriceRow}>
                <strong>
                  {product.sellingPrice
                    ? formatMoney(product.sellingPrice, product.currency, config.locale)
                    : isUS ? "Upon request" : "Sob consulta"}
                </strong>
              </div>
            </>
          ) : (
            <>
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
              {savings && (
                <span className={styles.storeSavings}>
                  {isUS ? "Save" : "Economize"} {formatMoney(savings, product.currency, config.locale)}
                </span>
              )}
              <ul className={styles.storeBenefits} aria-label={isUS ? "Purchase benefits" : "Benefícios da compra"}>
                <li>
                  <Truck aria-hidden="true" />
                  <span>
                    {isUS ? "Shipping across the United States" : "Frete para todo o Brasil"}
                    {product.estimatedDelivery && <small className={styles.storeDelivery}>{product.estimatedDelivery}</small>}
                  </span>
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" />
                  <span>{isUS ? "Secure checkout" : "Compra segura"}</span>
                </li>
              </ul>
              <span className={styles.storeCardActions}>
                <span className={styles.storeCardCta}>
                  {isUS ? "View product" : "Ver produto"} <ArrowRight aria-hidden="true" />
                </span>
                <span className={styles.storeFavoriteSpace} aria-hidden="true" />
              </span>
            </>
          )}
        </div>
      </Link>
      <button
        className={styles.storeFavoriteButton}
        type="button"
        disabled
        aria-label={isUS ? "Favorites coming soon" : "Favoritos em breve"}
        title={isUS ? "Favorites coming soon" : "Favoritos em breve"}
      >
        <Heart aria-hidden="true" />
      </button>
    </article>
  );
}

function getDiscountLabel(sellingPrice: number | null, compareAtPrice: number | null, discountPercent: number | null) {
  if (discountPercent && discountPercent > 0) return `${Math.round(discountPercent)}% OFF`;
  if (!sellingPrice || !compareAtPrice || compareAtPrice <= sellingPrice) return null;
  return `${Math.round(((compareAtPrice - sellingPrice) / compareAtPrice) * 100)}% OFF`;
}
