import { describe, expect, it } from "vitest";
import { groupHomeProducts, isHomeSofa, type HomeProductCandidate } from "@/lib/home-product-groups";

function product(
  id: string,
  title: string,
  categorySlug: string,
  productId = `product-${id}`,
): HomeProductCandidate {
  return { id, productId, title, category: { slug: categorySlug } };
}

describe("composição de produtos da home BR", () => {
  it.each(["Sofá Arco", "sofá modular", "SOFÁ de linho", "Sofá componível"])(
    "identifica sofá pelo nome sem diferenciar maiúsculas e composição Unicode: %s",
    (title) => {
      expect(isHomeSofa({ title })).toBe(true);
    },
  );

  it.each(["Cama Queen", "Colchão Premium", "Mesa lateral", "Poltrona", "Rack baixo"])(
    "não identifica outros móveis como sofá: %s",
    (title) => {
      expect(isHomeSofa({ title })).toBe(false);
    },
  );

  it("separa somente sofás por título e colchões pela categoria colchoes", () => {
    const products = [
      product("sofa-1", "Sofá Arco", "moveis"),
      product("mattress-1", "Colchão Aurora", "colchoes"),
      product("bed-1", "Cama Plataforma", "moveis"),
      product("table-1", "Mesa de centro", "moveis"),
      product("armchair-1", "Poltrona Nuvem", "moveis"),
      product("rack-1", "Rack Carvalho", "moveis"),
      product("wrong-category", "Colchão fora da categoria", "moveis"),
    ];

    const { sofas, mattresses } = groupHomeProducts(products);

    expect(sofas.map(({ id }) => id)).toEqual(["sofa-1"]);
    expect(mattresses.map(({ id }) => id)).toEqual(["mattress-1"]);
  });

  it("não coloca sofá no bloco de colchões mesmo se a categoria estiver incorreta", () => {
    const { sofas, mattresses } = groupHomeProducts([
      product("sofa", "Sofá erroneamente classificado", "colchoes"),
    ]);

    expect(sofas).toHaveLength(1);
    expect(mattresses).toHaveLength(0);
  });

  it("mantém a ordem do catálogo, inclui todos os elegíveis e remove duplicações por produto", () => {
    const products = [
      product("sofa-2", "Sofá Dois", "moveis"),
      product("sofa-1", "Sofá Um", "moveis"),
      product("sofa-1-copy", "Sofá Um", "moveis", "product-sofa-1"),
      product("mattress-2", "Colchão Dois", "colchoes"),
      product("mattress-1", "Colchão Um", "colchoes"),
      product("mattress-1-copy", "Colchão Um", "colchoes", "product-mattress-1"),
    ];

    const { sofas, mattresses } = groupHomeProducts(products);

    expect(sofas.map(({ id }) => id)).toEqual(["sofa-2", "sofa-1"]);
    expect(mattresses.map(({ id }) => id)).toEqual(["mattress-2", "mattress-1"]);
    expect(new Set([...sofas, ...mattresses].map(({ productId }) => productId)).size).toBe(
      sofas.length + mattresses.length,
    );
  });
});
