import { describe, expect, it } from "vitest";
import { publicProductAttributes, publicProductSpecifications } from "@/lib/public-product-attributes";

describe("atributos públicos de produto", () => {
  it("preserva especificações úteis ao cliente", () => {
    expect(publicProductAttributes({
      Material: " Linho ",
      Dimensões: "220 x 95 x 80 cm",
      estrutura: "Madeira maciça",
      mecanismos: 2,
    })).toEqual({
      Material: "Linho",
      Dimensões: "220 x 95 x 80 cm",
      estrutura: "Madeira maciça",
      mecanismos: 2,
    });
  });

  it("remove fornecedor, integração, configuração, flags e booleanos", () => {
    expect(publicProductAttributes({
      supplierName: "Manual BR",
      shippingStrategy: "MANUAL",
      manual: true,
      active: false,
      adapterKey: "manual-br",
      supplierProductId: "abc-123",
      integrationConfig: "internal",
      acabamento: "Fosco",
      impermeável: false,
      destaque: "false",
    })).toEqual({ acabamento: "Fosco" });
  });

  it("não produz linhas para valores vazios, inválidos ou exclusivamente internos", () => {
    expect(publicProductSpecifications({
      manual: true,
      shippingStrategy: "MANUAL",
      material: "   ",
      largura: Number.NaN,
    })).toEqual([]);
  });
});
