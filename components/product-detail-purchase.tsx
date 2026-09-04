"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Store, Truck } from "lucide-react";
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
  const [isShippingLoading, setIsShippingLoading] = useState(false);
  const [postalCode, setPostalCode] = useState("");
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressState>(emptyShippingAddress);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuoteOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [shippingMessage, setShippingMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [assistedMessage, setAssistedMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const selectedVariantId = selectedVariant?.id ?? null;
  const selectedPrice = selectedVariant?.salePrice ?? fallback.sellingPrice ?? 0;
  const requiresAssistedPurchase = market === "BR" && selectedPrice >= 10_000;
  const selectedShippingQuote = shippingQuotes.find((quote) => quote.quoteId === selectedQuoteId) ?? null;
  const requiresShippingQuote = market === "BR" && !requiresAssistedPurchase;
  const canStartCheckout = market === "BR" && !requiresAssistedPurchase && (!variants.length || Boolean(selectedVariantId)) && Boolean(selectedShippingQuote) && isShippingAddressComplete(shippingAddress);

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
          onSelectVariant={handleSelectVariant}
          fallback={fallback}
        />
        {installmentText && <p className={styles.installments}>{installmentText}</p>}
        <div className={styles.commerceDetails}>
          <p><Store size={16} /><span>{market === "US" ? "Supplied by" : "Fornecido por"} <strong>{supplierName}</strong></span></p>
          {estimatedDelivery && <p><Clock3 size={16} /><span>{market === "US" ? "Estimated delivery" : "Entrega estimada"}: {estimatedDelivery}</span></p>}
        </div>
        {market === "BR" && (
          <form className={styles.shippingBox} onSubmit={handleShippingQuote}>
            <label htmlFor="shipping-postal-code">Calcule o frete e prazo</label>
            <div className={styles.shippingFormRow}>
              <input
                id="shipping-postal-code"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                value={postalCode}
                onChange={(event) => setPostalCode(formatPostalCode(event.target.value))}
              />
              <button type="submit" disabled={isShippingLoading || requiresAssistedPurchase || (variants.length > 0 && !selectedVariantId)}>
                {isShippingLoading ? "Calculando" : "Calcular"}
              </button>
            </div>
            {shippingQuotes.length > 0 && (
              <div className={styles.shippingOptions} aria-label="Opções de entrega">
                {shippingQuotes.map((quote) => (
                  <label key={quote.quoteId} className={styles.shippingOption} data-selected={quote.quoteId === selectedQuoteId}>
                    <input
                      type="radio"
                      name="shippingQuote"
                      value={quote.quoteId}
                      checked={quote.quoteId === selectedQuoteId}
                      onChange={() => {
                        setSelectedQuoteId(quote.quoteId);
                        idempotencyKeyRef.current = null;
                      }}
                    />
                    <Truck size={17} aria-hidden="true" />
                    <span>
                      <strong>{quote.serviceName}</strong>
                      <small>{deliveryEstimate(quote)}</small>
                    </span>
                    <b>{formatMoney(quote.price, quote.currency)}</b>
                  </label>
                ))}
              </div>
            )}
            {shippingMessage && <p className={styles.shippingMessage}>{shippingMessage}</p>}
          </form>
        )}
        {selectedShippingQuote && (
          <div className={styles.addressBox}>
            <p>Endereço de entrega</p>
            <div className={styles.addressGrid}>
              <label>Destinatário<input value={shippingAddress.recipientName} onChange={(event) => patchShippingAddress("recipientName", event.target.value)} /></label>
              <label>CEP<input value={postalCode} disabled /></label>
              <label>Rua<input value={shippingAddress.street} onChange={(event) => patchShippingAddress("street", event.target.value)} /></label>
              <label>Número<input value={shippingAddress.number} onChange={(event) => patchShippingAddress("number", event.target.value)} /></label>
              <label>Complemento<input value={shippingAddress.complement} onChange={(event) => patchShippingAddress("complement", event.target.value)} /></label>
              <label>Bairro<input value={shippingAddress.neighborhood} onChange={(event) => patchShippingAddress("neighborhood", event.target.value)} /></label>
              <label>Cidade<input value={shippingAddress.city} onChange={(event) => patchShippingAddress("city", event.target.value)} /></label>
              <label>Estado<input value={shippingAddress.state} maxLength={2} onChange={(event) => patchShippingAddress("state", event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} /></label>
            </div>
          </div>
        )}
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
            {isCheckoutLoading ? "Iniciando checkout..." : requiresShippingQuote && !selectedShippingQuote ? "Calcule o frete para comprar" : selectedShippingQuote && !isShippingAddressComplete(shippingAddress) ? "Informe endereço para comprar" : "Comprar agora"}
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
        body: JSON.stringify({
          productId,
          offerId,
          variantId: selectedVariantId,
          quantity: 1,
          quoteId: selectedShippingQuote?.quoteId,
          destinationPostalCode: postalCode,
          shippingAddress: { ...shippingAddress, postalCode },
        }),
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

  function handleSelectVariant(variant: CatalogProductVariant) {
    setSelectedVariant(variant);
    setShippingQuotes([]);
    setSelectedQuoteId(null);
    setShippingMessage(null);
    setCheckoutError(null);
    setShippingAddress(emptyShippingAddress);
    idempotencyKeyRef.current = null;
  }

  function patchShippingAddress(field: keyof ShippingAddressState, value: string) {
    setShippingAddress((current) => ({ ...current, [field]: value }));
    idempotencyKeyRef.current = null;
  }

  async function handleShippingQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requiresAssistedPurchase || isShippingLoading) return;
    setShippingMessage(null);
    setCheckoutError(null);
    setAssistedMessage(null);
    setShippingQuotes([]);
    setSelectedQuoteId(null);
    setIsShippingLoading(true);
    trackNomaPurchaseIntent({ eventType: "shipping_quote_requested", market, productId, productSlug, variantId: selectedVariantId });

    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerId, variantId: selectedVariantId, destinationPostalCode: postalCode, quantity: 1 }),
      });
      const payload = await response.json().catch(() => null) as ShippingQuoteApiResponse | null;
      if (payload?.type === "quotes" && payload.quotes.length) {
        setShippingQuotes(payload.quotes);
        setSelectedQuoteId(payload.quotes[0]?.quoteId ?? null);
        setShippingMessage(null);
        trackNomaPurchaseIntent({ eventType: "shipping_quote_succeeded", market, productId, productSlug, variantId: selectedVariantId });
        return;
      }
      if (payload?.type === "assisted_purchase") {
        setAssistedMessage(payload.message);
        setShippingMessage(payload.message);
        trackNomaPurchaseIntent({ eventType: "shipping_quote_failed", market, productId, productSlug, variantId: selectedVariantId });
        return;
      }
      setShippingMessage(payload?.type === "error" ? payload.message : "Nao foi possivel calcular o frete agora.");
      trackNomaPurchaseIntent({ eventType: "shipping_quote_failed", market, productId, productSlug, variantId: selectedVariantId });
    } catch {
      setShippingMessage("Nao foi possivel calcular o frete agora. Tente novamente.");
      trackNomaPurchaseIntent({ eventType: "shipping_quote_failed", market, productId, productSlug, variantId: selectedVariantId });
    } finally {
      setIsShippingLoading(false);
    }
  }
}

const emptyShippingAddress = {
  recipientName: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

type CheckoutApiResponse =
  | { type: "checkout"; redirectUrl: string; orderNumber: string }
  | { type: "assisted_purchase"; message: string; reason: string }
  | { type: "error"; message: string; error: string };

type ShippingQuoteOption = {
  quoteId: string;
  serviceCode: string;
  serviceName: string;
  price: number;
  currency: string;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
  expiresAt: string;
};

type ShippingQuoteApiResponse =
  | { type: "quotes"; quotes: ShippingQuoteOption[] }
  | { type: "assisted_purchase"; message: string; reason: string }
  | { type: "error"; message: string; error: string };

type ShippingAddressState = typeof emptyShippingAddress;

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

function deliveryEstimate(quote: ShippingQuoteOption) {
  if (quote.estimatedMinDays != null && quote.estimatedMaxDays != null) {
    return quote.estimatedMinDays === quote.estimatedMaxDays
      ? `${quote.estimatedMaxDays} dias uteis`
      : `${quote.estimatedMinDays} a ${quote.estimatedMaxDays} dias uteis`;
  }
  if (quote.estimatedMaxDays != null) return `Ate ${quote.estimatedMaxDays} dias uteis`;
  return "Prazo a confirmar";
}

function isShippingAddressComplete(address: ShippingAddressState) {
  return Boolean(
    address.recipientName.trim()
    && address.street.trim()
    && address.number.trim()
    && address.neighborhood.trim()
    && address.city.trim()
    && /^[A-Z]{2}$/.test(address.state),
  );
}
