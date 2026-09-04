"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  offerId: string;
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
  offerId,
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
  const router = useRouter();
  const defaultVariant = useMemo(() => variants.find((variant) => variant.isDefault) ?? variants[0], [variants]);
  const [selectedVariant, setSelectedVariant] = useState(defaultVariant);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [assistedMessage, setAssistedMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const selectedVariantId = selectedVariant?.id ?? null;
  const selectedPrice = selectedVariant?.salePrice ?? fallback.sellingPrice ?? 0;
  const requiresAssistedPurchase = market === "BR" && selectedPrice >= 10_000;
  const canStartCheckout = market === "BR" && !requiresAssistedPurchase && (!variants.length || Boolean(selectedVariantId));

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
        {market === "US" ? (
          <button disabled className={styles.buyButton}>Available soon</button>
        ) : requiresAssistedPurchase || assistedMessage ? (
          <button className={styles.buyButton} type="button" onClick={handleAssistedPurchase}>
            Solicitar atendimento de compra
          </button>
        ) : (
          <button
            disabled={isCheckoutLoading || !canStartCheckout}
            className={styles.buyButton}
            type="button"
            data-noma-event="buy_click"
            data-noma-product-id={productId}
            data-noma-product-slug={productSlug}
            data-noma-selected-variant-id={selectedVariantId ?? undefined}
            onClick={handleBuyNow}
          >
            {isCheckoutLoading ? "Iniciando checkout..." : "Comprar agora"}
          </button>
        )}
        {(checkoutError || assistedMessage) && (
          <p className={styles.purchaseMessage}>{checkoutError ?? assistedMessage}</p>
        )}
      </div>
    </section>
  );

  async function handleBuyNow() {
    if (!canStartCheckout || isCheckoutLoading) return;
    setCheckoutError(null);
    setAssistedMessage(null);
    setIsCheckoutLoading(true);
    trackNomaPurchaseIntent({
      eventType: "buy_click",
      market,
      productId,
      productSlug,
      variantId: selectedVariantId,
    });

    idempotencyKeyRef.current = idempotencyKeyRef.current ?? createIdempotencyKey();
    try {
      const response = await fetch("/api/checkout/mercado-pago", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKeyRef.current,
        },
        credentials: "same-origin",
        body: JSON.stringify({ productId, offerId, variantId: selectedVariantId, quantity: 1 }),
      });
      const payload = await response.json().catch(() => null) as CheckoutApiResponse | null;
      if (payload?.type === "checkout" && payload.redirectUrl) {
        trackNomaPurchaseIntent({
          eventType: "checkout_start",
          market,
          productId,
          productSlug,
          variantId: selectedVariantId,
        });
        window.location.assign(payload.redirectUrl);
        return;
      }
      if (payload?.type === "assisted_purchase") {
        setAssistedMessage(payload.message);
        trackNomaPurchaseIntent({
          eventType: "assisted_purchase_click",
          market,
          productId,
          productSlug,
          variantId: selectedVariantId,
        });
        return;
      }
      setCheckoutError(payload?.type === "error" ? payload.message : "Nao foi possivel iniciar o checkout agora.");
    } catch {
      setCheckoutError("Nao foi possivel iniciar o checkout agora. Tente novamente.");
    } finally {
      setIsCheckoutLoading(false);
    }
  }

  function handleAssistedPurchase() {
    trackNomaPurchaseIntent({
      eventType: "assisted_purchase_click",
      market,
      productId,
      productSlug,
      variantId: selectedVariantId,
    });
    router.push("/br#contato");
  }
}

type CheckoutApiResponse =
  | { type: "checkout"; redirectUrl: string; orderNumber: string }
  | { type: "assisted_purchase"; message: string; reason: string }
  | { type: "error"; message: string; error: string };

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
