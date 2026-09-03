"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Store } from "lucide-react";
import { trackNomaPurchaseIntent } from "@/components/analytics/noma-intent-tracking";
import { ProductGallery } from "@/components/product-gallery";
import { ProductVariantSelector } from "@/components/product-variant-selector";
import { Rating } from "@/components/rating";
import type { CatalogProductVariant } from "@/lib/catalog";
import type { Market } from "@/lib/market";
import styles from "./product-detail.module.css";

interface ProductDetailPurchaseProps {
  productId: string;
  productSlug: string;
  images: Array<{ id: string; url: string; alt: string | null }>;
  name: string;
  brandLabel: string;
  shortDescription: string | null;
  rating: number | null;
  reviewCount: number | null;
  supplierName: string;
  estimatedDelivery: string | null;
  installmentText: string | null;
  sprite?: { column: number; row: number };
  variants: CatalogProductVariant[];
  fallback: {
    sellingPrice: number | null;
    compareAtPrice: number | null;
    discountPercent: number | null;
    currency: string;
    stock: number;
    availability: string;
  };
  market: Market;
}

export function ProductDetailPurchase({
  productId,
  productSlug,
  images,
  name,
  brandLabel,
  shortDescription,
  rating,
  reviewCount,
  supplierName,
  estimatedDelivery,
  installmentText,
  sprite,
  variants,
  fallback,
  market,
}: ProductDetailPurchaseProps) {
  const defaultVariant = useMemo(() => variants.find((variant) => variant.isDefault) ?? variants[0], [variants]);
  const [selectedVariant, setSelectedVariant] = useState(defaultVariant);
  const selectedVariantId = selectedVariant?.id ?? null;

  useEffect(() => {
    trackNomaPurchaseIntent({
      eventType: "product_view",
      market,
      productId,
      productSlug,
      variantId: selectedVariantId,
    });
  }, [market, productId, productSlug, selectedVariantId]);

  return (
    <section
      className={styles.productDetail}
      data-noma-product-id={productId}
      data-noma-product-slug={productSlug}
      data-noma-selected-variant-id={selectedVariantId ?? undefined}
    >
      <ProductGallery key={selectedVariant?.imageUrl ?? "general-gallery"} images={images} name={name} sprite={sprite} featuredImageUrl={selectedVariant?.imageUrl} />
      <div className={styles.summary}>
        <p className={styles.brand}>{brandLabel}</p>
        <h1 className={styles.title}>{name}</h1>
        <div className={styles.rating}><Rating value={rating} count={reviewCount} market={market} /></div>
        {shortDescription && <p className={styles.description}>{shortDescription}</p>}
        <ProductVariantSelector
          market={market}
          variants={variants}
          selectedId={selectedVariant?.id}
          onSelectVariant={setSelectedVariant}
          fallback={fallback}
        />
        {installmentText && <p className={styles.installments}>{installmentText}</p>}
        <div className={styles.commerceDetails}>
          <p><Store size={16} /><span>{market === "US" ? "Supplied by" : "Fornecido por"} <strong>{supplierName}</strong></span></p>
          {estimatedDelivery && <p><Clock3 size={16} /><span>{market === "US" ? "Estimated delivery" : "Entrega estimada"}: {estimatedDelivery}</span></p>}
        </div>
        <button
          disabled
          className={styles.buyButton}
          data-noma-event="buy_click"
          data-noma-product-id={productId}
          data-noma-product-slug={productSlug}
          data-noma-selected-variant-id={selectedVariantId ?? undefined}
          onClick={() => trackNomaPurchaseIntent({
            eventType: "buy_click",
            market,
            productId,
            productSlug,
            variantId: selectedVariantId,
          })}
        >
          {market === "US" ? "Available soon" : "Comprar em breve"}
        </button>
      </div>
    </section>
  );
}
