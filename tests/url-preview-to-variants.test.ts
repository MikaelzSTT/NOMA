import { describe, expect, it } from "vitest";
import { previewToOfferVariants } from "@/lib/admin/url-preview-to-variants";
import type { ProductUrlImportPreview } from "@/lib/product-import/types";

const preview = {
  sourceUrl: "https://supplier.example/produto",
  canonicalUrl: "https://supplier.example/produto?variant_id=1",
  title: "Cama Vegas",
  sku: "VEGAS",
  sourcePrice: 1025,
  compareAtPrice: 1388.39,
  currency: "BRL",
  availability: "AVAILABLE",
  images: [{ url: "https://cdn.example/vegas.jpg" }],
  variants: [
    {
      label: "Solteiro",
      sku: "VEGAS-SOL",
      attributes: { tamanho: "Solteiro" },
      sourcePrice: 900,
      compareAtPrice: 1200,
      currency: "BRL",
      availability: "AVAILABLE",
      sourceUrl: "https://supplier.example/produto?variant_id=1",
      imageUrl: "https://cdn.example/solteiro.jpg",
    },
    {
      label: "King",
      sku: "VEGAS-KING",
      attributes: { tamanho: "King" },
      sourcePrice: 1300,
      compareAtPrice: 1700,
      currency: "BRL",
      availability: "AVAILABLE",
      sourceUrl: "https://supplier.example/produto?variant_id=2",
      imageUrl: "https://cdn.example/king.jpg",
    },
  ],
  warnings: [],
  extraction: { domain: "supplier.example", sources: ["json-ld"] },
} satisfies ProductUrlImportPreview;

describe("preview de URL para variantes comerciais", () => {
  it("mapeia sourcePrice do fornecedor para costPrice", () => {
    const variants = previewToOfferVariants(preview, "BRL");

    expect(variants[0]).toMatchObject({
      label: "Solteiro",
      sku: "VEGAS-SOL",
      costPrice: 900,
      sourcePriceReference: 900,
      compareAtPrice: 1200,
      sourceUrl: "https://supplier.example/produto?variant_id=1",
      imageUrl: "https://cdn.example/solteiro.jpg",
      attributes: { tamanho: "Solteiro" },
    });
  });

  it("não copia sourcePrice automaticamente para salePrice da NOMA", () => {
    const variants = previewToOfferVariants(preview, "BRL");

    expect(variants[0]?.salePrice).toBe(0);
    expect(variants[0]?.salePrice).not.toBe(variants[0]?.costPrice);
    expect(variants[0]?.salePricePending).toBe(true);
  });

  it("preserva custos diferentes por variante", () => {
    const variants = previewToOfferVariants(preview, "BRL");

    expect(variants.map((variant) => variant.costPrice)).toEqual([900, 1300]);
  });
});
