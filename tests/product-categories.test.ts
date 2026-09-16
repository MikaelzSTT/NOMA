import { describe, expect, it } from "vitest";
import { classifyProductTitle, resolveProductCategory } from "@/lib/product-categories";

describe("categorias principais de produto", () => {
  it.each([
    "Colchão Pikolin Atelier 32 cm",
    "COLCHAO Georgia - American Sleep",
    "Cama Box com Colchão King Size",
  ])("classifica %s como Colchões ignorando caixa e acentos", (title) => {
    expect(classifyProductTitle(title)).toBe("colchoes");
  });

  it.each([
    "Sofá Reclinável Elétrico Z374",
    "SOFA Arco",
    "Cama Bruma",
    "Mesa Lume",
    "Poltrona Lina",
    "Rack Vértice",
  ])("classifica %s como Móveis ignorando caixa e acentos", (title) => {
    expect(classifyProductTitle(title)).toBe("moveis");
  });

  it("não classifica títulos sem regra ou com sinais conflitantes", () => {
    expect(classifyProductTitle("Produto sem tipo reconhecido")).toBeNull();
    expect(classifyProductTitle("Sofá-cama com colchão")).toBeNull();
  });

  it("aceita somente labels e slugs canônicos como escolha explícita", () => {
    expect(resolveProductCategory({ title: "Mesa", category: "Móveis" })).toBe("moveis");
    expect(resolveProductCategory({ title: "Mesa", categorySlug: "colchoes" })).toBe("colchoes");
  });

  it("normaliza categorias singulares vindas dos fornecedores pelas mesmas regras", () => {
    expect(resolveProductCategory({ title: "Produto", category: "Colchão" })).toBe("colchoes");
    expect(resolveProductCategory({ title: "Produto", category: "Sofás" })).toBe("moveis");
  });
});
