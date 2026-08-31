import { describe, expect, it } from "vitest";
import { parseProductHtmlWithAdapters, validatePublicProductUrl } from "@/lib/product-import/url-importer";

const baseUrl = new URL("https://loja.example/produto/sofa");

describe("importação de produto por URL", () => {
  it("extrai Product em JSON-LD com preço e variantes", () => {
    const preview = parseProductHtmlWithAdapters(`
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Sofá Modular",
          "description": "Sofá em linho com chaise.",
          "brand": {"@type": "Brand", "name": "Noma"},
          "sku": "SOFA-1",
          "category": "Sofás",
          "image": ["https://cdn.example/sofa-1.jpg", "https://cdn.example/sofa-2.jpg"],
          "offers": {"@type": "Offer", "price": "1999.90", "priceCurrency": "BRL", "availability": "https://schema.org/InStock"},
          "hasVariant": [
            {
              "@type": "Product",
              "name": "Sofá Modular Azul",
              "sku": "SOFA-1-AZ",
              "image": "https://cdn.example/sofa-azul.jpg",
              "offers": {"@type": "Offer", "price": 2099.9, "priceCurrency": "BRL"},
              "additionalProperty": [{"name": "cor", "value": "Azul"}]
            },
            {
              "@type": "Product",
              "name": "Sofá Modular Cinza",
              "sku": "SOFA-1-CZ",
              "offers": {"@type": "Offer", "price": 1999.9, "priceCurrency": "BRL"}
            }
          ]
        }
      </script>
    `, baseUrl);

    expect(preview).toMatchObject({
      title: "Sofá Modular",
      description: "Sofá em linho com chaise.",
      brand: "Noma",
      sku: "SOFA-1",
      category: "Sofás",
      sourcePrice: 1999.9,
      currency: "BRL",
      availability: "AVAILABLE",
    });
    expect(preview.images.map((image) => image.url)).toContain("https://cdn.example/sofa-1.jpg");
    expect(preview.variants).toHaveLength(2);
    expect(preview.variants[0]).toMatchObject({ label: "Sofá Modular Azul", sku: "SOFA-1-AZ", sourcePrice: 2099.9, attributes: { cor: "Azul" } });
  });

  it("deduplica imagens e ignora logos, ícones e imagens pequenas", () => {
    const preview = parseProductHtmlWithAdapters(`
      <meta property="og:image" content="https://cdn.example/produto.jpg">
      <img src="https://cdn.example/produto.jpg" width="900" height="900" alt="Produto">
      <img src="https://cdn.example/logo.png" width="300" height="120" alt="Logo">
      <img src="https://cdn.example/thumb.jpg" width="60" height="60" alt="Thumb">
      <img src="https://cdn.example/icone.svg" width="300" height="300" alt="Icone">
    `, baseUrl);

    expect(preview.images.map((image) => image.url)).toEqual(["https://cdn.example/produto.jpg"]);
  });

  it("usa metatags como fallback para título, descrição, imagem, preço e moeda", () => {
    const preview = parseProductHtmlWithAdapters(`
      <meta property="og:title" content="Mesa Lateral - Loja">
      <meta property="og:description" content="Mesa lateral em madeira.">
      <meta property="og:image" content="/mesa.jpg">
      <meta property="product:price:amount" content="349,90">
      <meta property="product:price:currency" content="BRL">
      <meta property="product:availability" content="out of stock">
    `, baseUrl);

    expect(preview).toMatchObject({
      title: "Mesa Lateral",
      description: "Mesa lateral em madeira.",
      sourcePrice: 349.9,
      currency: "BRL",
      availability: "OUT_OF_STOCK",
    });
    expect(preview.images[0]?.url).toBe("https://loja.example/mesa.jpg");
  });

  it("rejeita URL inválida", async () => {
    await expect(validatePublicProductUrl("nota-url")).rejects.toMatchObject({ code: "invalid-url" });
  });

  it("bloqueia SSRF para localhost e IP privado", async () => {
    await expect(validatePublicProductUrl("http://localhost:3000/admin")).rejects.toMatchObject({ code: "blocked-url" });
    await expect(validatePublicProductUrl("http://127.0.0.1/admin")).rejects.toMatchObject({ code: "blocked-url" });
    await expect(validatePublicProductUrl("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({ code: "blocked-url" });
  });

  it("aplica o adapter da Acorde Bem para dataLayer Tray com variantes", () => {
    const preview = parseProductHtmlWithAdapters(`
      <script>
        dataLayer = [{
          "pageCategory":"Produto",
          "idProduct":"326",
          "nameProduct":"Sleep Max D45 Colchões Castor Espuma 15 Cm",
          "category":"Colchão",
          "priceSell":1025,
          "price":1388.39,
          "brand":"Castor",
          "availability":"YES",
          "urlImage":"https://images.tcdn.com.br/img/img_prod/573513/colchao_326_1.jpg",
          "listSku":[
            {"idSku":"326-17901","nameSku":"Medida: Colchão De Espuma 078x188x15cm","price":1388.39,"sellPrice":1025,"availability":"YES","urlImage":""},
            {"idSku":"326-17903","nameSku":"Medida: Colchão De Espuma 088x188x15cm","price":1488.39,"sellPrice":1125,"availability":"NO","urlImage":""}
          ],
          "breadcrumbDetails":[{"id":481,"name":"Colchão","level":1}]
        }]
      </script>
    `, new URL("https://www.colchoesacordebem.com.br/produto/x"));

    expect(preview.extraction.adapter).toBe("colchoes-acorde-bem");
    expect(preview).toMatchObject({ title: "Sleep Max D45 Colchões Castor Espuma 15 Cm", brand: "Castor", category: "Colchão", sourcePrice: 1025, compareAtPrice: 1388.39 });
    expect(preview.images[0]?.url).toBe("https://images.tcdn.com.br/img/img_prod/573513/colchao_326_1.jpg");
    expect(preview.variants).toHaveLength(2);
    expect(preview.variants[0]).toMatchObject({ sku: "326-17901", sourcePrice: 1025, compareAtPrice: 1388.39, attributes: { medida: "Colchão De Espuma 078x188x15cm", dimensoes: "078x188x15" } });
    expect(preview.variants[1]).toMatchObject({ availability: "OUT_OF_STOCK", sourcePrice: 1125 });
  });
});
