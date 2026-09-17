import { describe, expect, it } from "vitest";
import { toAdminOfferVariants } from "@/lib/admin/offer-variant-mapper";

const product = {
  title: "Colchão Prisma",
  sku: "COL-PRISMA",
  costPrice: 1000,
  sellingPrice: 1800,
  compareAtPrice: 2000,
  stock: 3,
  availability: "AVAILABLE",
};

const offer = {
  sku: "COL-PRISMA-BR",
  costPrice: 1000,
  sellingPrice: 1800,
  compareAtPrice: 2000,
  manualPriceOverride: false,
  stockQuantity: 3,
  active: true,
  availability: "AVAILABLE",
  sourceUrl: "https://supplier.example/colchao-prisma",
};

describe("toAdminOfferVariants", () => {
  it("carrega variante antiga sem manualActiveOverride explícito", () => {
    const variants = toAdminOfferVariants({
      ...offer,
      variants: [{
        label: "Solteiro",
        sku: "COL-SOL",
        attributes: { tamanho: "Solteiro", privateData: { hidden: true } },
        costPrice: 700,
        salePrice: 1290,
        stock: 0,
        active: false,
        availability: "OUT_OF_STOCK",
        isDefault: true,
      }],
    }, product);

    expect(variants[0]).toMatchObject({
      label: "Solteiro",
      sku: "COL-SOL",
      attributes: { tamanho: "Solteiro" },
      costPrice: 700,
      salePrice: 1290,
      stock: 0,
      active: false,
      availability: "OUT_OF_STOCK",
      manualPriceOverride: false,
      hasColorMaterial: false,
      isDefault: true,
    });
  });

  it("carrega variante com manualActiveOverride=false", () => {
    const variants = toAdminOfferVariants({
      ...offer,
      variants: [{
        label: "Casal",
        sku: "COL-CAS",
        attributes: { tamanho: "Casal" },
        costPrice: 900,
        salePrice: 1590,
        manualActiveOverride: false,
        stock: 0,
        active: true,
        availability: "OUT_OF_STOCK",
        isDefault: true,
      }],
    }, product);

    expect(variants[0]).toMatchObject({
      sku: "COL-CAS",
      stock: 0,
      active: true,
      availability: "OUT_OF_STOCK",
    });
  });

  it("carrega variante com manualActiveOverride=true", () => {
    const variants = toAdminOfferVariants({
      ...offer,
      variants: [{
        label: "Queen",
        sku: "COL-QUE",
        attributes: { tamanho: "Queen" },
        costPrice: 1100,
        salePrice: 1990,
        manualActiveOverride: true,
        stock: 5,
        active: false,
        availability: "AVAILABLE",
        isDefault: true,
      }],
    }, product);

    expect(variants[0]).toMatchObject({
      sku: "COL-QUE",
      stock: 5,
      active: false,
      availability: "AVAILABLE",
    });
  });

  it("carrega os metadados opcionais de cor/material da variante", () => {
    const variants = toAdminOfferVariants({
      ...offer,
      variants: [{
        label: "Queen + Linho Bege",
        attributes: { tamanho: "Queen" },
        costPrice: 1100,
        salePrice: 1990,
        stock: 5,
        active: true,
        availability: "AVAILABLE",
        hasColorMaterial: true,
        colorMaterialName: "Linho Bege",
        materialType: "Linho",
        colorHex: "#D8C3A5",
        textureImageUrl: "https://cdn.example.com/linho-bege.jpg",
        isDefault: true,
      }],
    }, product);

    expect(variants[0]).toMatchObject({
      hasColorMaterial: true,
      colorMaterialName: "Linho Bege",
      materialType: "Linho",
      colorHex: "#D8C3A5",
      textureImageUrl: "https://cdn.example.com/linho-bege.jpg",
    });
  });
});
