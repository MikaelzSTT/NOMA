"use client";

import { useMemo, useState } from "react";
import { Clock3, Store } from "lucide-react";
import { ProductGallery } from "@/components/product-gallery";
import { ProductVariantSelector } from "@/components/product-variant-selector";
import { Rating } from "@/components/rating";
import type { CatalogProductVariant } from "@/lib/catalog";
import type { Market } from "@/lib/market";

interface ProductDetailPurchaseProps {
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

  return (
    <section className="product-detail">
      <ProductGallery key={selectedVariant?.imageUrl ?? "general-gallery"} images={images} name={name} sprite={sprite} featuredImageUrl={selectedVariant?.imageUrl} />
      <div className="product-summary">
        <p className="eyebrow">{brandLabel}</p>
        <h1>{name}</h1>
        <div className="mt-3"><Rating value={rating} count={reviewCount} /></div>
        <p className="mt-5 text-sm leading-6 text-muted">{shortDescription}</p>
        <ProductVariantSelector
          market={market}
          variants={variants}
          selectedId={selectedVariant?.id}
          onSelectVariant={setSelectedVariant}
          fallback={fallback}
        />
        {installmentText && <p className="mt-2 text-sm text-muted">{installmentText}</p>}
        <div className="mt-3 space-y-3 text-sm">
          <p className="flex items-center gap-2"><Store size={17} className="text-brand" /><span>{market === "US" ? "Supplier" : "Fornecedor"} <strong>{supplierName}</strong></span></p>
          {estimatedDelivery && <p className="flex items-center gap-2 text-muted"><Clock3 size={17} /><span>{market === "US" ? "Estimated delivery" : "Entrega estimada"}: {estimatedDelivery}</span></p>}
        </div>
        <button disabled className="button-buy opacity-60">{market === "US" ? "Checkout coming in a future step" : "Compra disponível em uma próxima etapa"}</button>
      </div>
    </section>
  );
}
