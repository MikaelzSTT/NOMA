import { afterEach, describe, expect, it, vi } from "vitest";
import { colchoesAcordeBemAdapter } from "@/lib/product-import/adapters/colchoes-acorde-bem";
import { sleepHouseAdapter } from "@/lib/product-import/adapters/sleep-house";
import { parseProductHtmlWithAdapters, previewProductFromUrl, validatePublicProductUrl } from "@/lib/product-import/url-importer";

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async () => [{ address: "203.0.113.10" }]),
  },
}));

const baseUrl = new URL("https://loja.example/produto/sofa");

describe("importação de produto por URL", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("normaliza mojibake da Acorde Bem em texto de produto e atributos", () => {
    const preview = parseProductHtmlWithAdapters(`
      <script>
        dataLayer = [{
          "pageCategory":"Produto",
          "idProduct":"326",
          "nameProduct":"Sleep Max D45 Colch�o Castor",
          "description":"Descri��o do colch�o em espuma.",
          "category":"Colch�o",
          "priceSell":1025,
          "price":1388.39,
          "brand":"Castor",
          "availability":"YES",
          "urlImage":"https://images.tcdn.com.br/img/img_prod/573513/colchao_326_1.jpg",
          "listSku":[
            {"idSku":"326-17901","nameSku":"Medida: Colch�o De Espuma 078x188x15cm","price":1388.39,"sellPrice":1025,"availability":"YES","urlImage":""}
          ],
          "breadcrumbDetails":[{"id":481,"name":"Colch�o","level":1}]
        }]
      </script>
    `, new URL("https://www.colchoesacordebem.com.br/produto/x"));

    expect(preview.title).toBe("Sleep Max D45 Colchão Castor");
    expect(preview.description).toBe("Descrição do colchão em espuma.");
    expect(preview.category).toBe("Colchão");
    expect(preview.variants[0]).toMatchObject({
      label: "Medida: Colchão De Espuma 078x188x15cm",
      sku: "326-17901",
      sourcePrice: 1025,
      compareAtPrice: 1388.39,
      attributes: { medida: "Colchão De Espuma 078x188x15cm", dimensoes: "078x188x15" },
    });
  });

  it("não replica o preço global da Acorde Bem para variantes sem preço individual seguro", () => {
    const preview = parseProductHtmlWithAdapters(`
      <meta property="og:image" content="https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_1.jpg">
      <script>
        dataLayer = [{
          "pageCategory":"Produto",
          "idProduct":"1417",
          "nameProduct":"Cama Box Universal Com Colchão Simmons Vegas",
          "category":"Cama Box com Colchão",
          "priceSell":6696.9,
          "price":7760.08,
          "brand":"Simmons",
          "availability":"YES",
          "urlImage":"https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_1.jpg",
          "listSku":[
            {"idSku":"1417-7265","nameSku":"Quantidade: Com Box Solteiro 088x188x62","price":4437.9,"sellPrice":6696.9,"availability":"YES","urlImage":""},
            {"idSku":"1417-7277","nameSku":"Quantidade: Com Box Universal King Size 193x203x62","price":7760.08,"sellPrice":6696.9,"availability":"YES","urlImage":""}
          ]
        }]
      </script>
      <div id="product-wrapper">
        <div class="product-gallery"><div class="product-images">
          <img data-src="https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_2.jpg" alt="Simmons Vegas">
        </div></div>
      </div>
      <img data-src="https://images.tcdn.com.br/img/img_prod/573513/outro_produto_999_1.jpg" alt="Outro colchão">
    `, new URL("https://www.colchoesacordebem.com.br/produto/vegas?variant_id=7277"));

    expect(preview.variants).toHaveLength(2);
    expect(preview.variants[0]).toMatchObject({ label: "Com Box Solteiro 088x188x62", sku: "1417-7265", sourcePrice: undefined, compareAtPrice: 4437.9 });
    expect(preview.variants[1]).toMatchObject({ label: "Com Box Universal King Size 193x203x62", sku: "1417-7277", sourcePrice: 6696.9, compareAtPrice: 7760.08 });
    expect(new Set(preview.variants.map((variant) => variant.sourcePrice))).not.toEqual(new Set([6696.9]));
    expect(preview.warnings).toContain("Acorde Bem não expôs preço individual seguro para uma ou mais variantes; revise preço de venda antes de salvar.");
    expect(preview.images.map((image) => image.url)).toEqual([
      "https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_1.jpg",
      "https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_2.jpg",
    ]);
  });

  it("preenche imagens próprias de variantes da Acorde Bem a partir de cada variant_id", async () => {
    const url = new URL("https://www.colchoesacordebem.com.br/produto/vegas?variant_id=7265");
    const html = `
      <meta property="og:image" content="https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_1.jpg">
      <script>
        dataLayer = [{
          "pageCategory":"Produto",
          "idProduct":"1417",
          "nameProduct":"Cama Box Universal Com Colchão Simmons Vegas",
          "category":"Cama Box com Colchão",
          "priceSell":6696.9,
          "price":7760.08,
          "brand":"Simmons",
          "availability":"YES",
          "urlImage":"https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_1.jpg",
          "listSku":[
            {"idSku":"1417-7265","nameSku":"Quantidade: Com Box Casal 138x188x62","price":4437.9,"sellPrice":6696.9,"availability":"YES","urlImage":""},
            {"idSku":"1417-7267","nameSku":"Quantidade: Com Box Queen 158x198x62","price":7760.08,"sellPrice":6696.9,"availability":"YES","urlImage":""}
          ]
        }]
      </script>
      <div class="product-gallery"><div class="product-images">
        <img data-src="https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_2.jpg" alt="Simmons Vegas">
      </div></div>
    `;
    const preview = parseProductHtmlWithAdapters(html, url);
    const variantPages: Record<string, string> = {
      "7265": `
        <input id="selectedVariant" value="7265">
        <script>
          dataLayer = [{
            "pageCategory":"Produto",
            "idProduct":"1417",
            "nameProduct":"Cama Box Universal Com Colchão Simmons Vegas",
            "priceSell":4437.9,
            "price":4437.9,
            "availability":"YES",
            "urlImage":"https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_1.jpg",
            "listSku":[{"idSku":"1417-7265","nameSku":"Quantidade: Com Box Casal 138x188x62","urlImage":"https://images.tcdn.com.br/img/img_prod/573513/sku_casal_1417_7265.jpg"}]
          }]
        </script>
        <div class="product-gallery"><div class="product-images">
          <img data-src="https://images.tcdn.com.br/img/img_prod/573513/vegas_casal_1417_7265.jpg" alt="Simmons Vegas Casal">
        </div></div>
      `,
      "7267": `
        <input id="selectedVariant" value="7267">
        <script>
          dataLayer = [{
            "pageCategory":"Produto",
            "idProduct":"1417",
            "nameProduct":"Cama Box Universal Com Colchão Simmons Vegas",
            "priceSell":5599.9,
            "price":7760.08,
            "availability":"YES",
            "urlImage":"https://images.tcdn.com.br/img/img_prod/573513/vegas_queen_1417_7267.jpg",
            "listSku":[{"idSku":"1417-7267","nameSku":"Quantidade: Com Box Queen 158x198x62","urlImage":"https://images.tcdn.com.br/img/img_prod/573513/sku_queen_1417_7267.jpg"}]
          }]
        </script>
      `,
    };
    const fetchHtml = vi.fn(async (variantUrl: URL) => ({ url: variantUrl, html: variantPages[variantUrl.searchParams.get("variant_id") ?? ""] ?? "" }));
    const fetchJson = vi.fn(async (jsonUrl: URL) => ({ url: jsonUrl, json: {} }));

    const enhanced = await colchoesAcordeBemAdapter.enhanceRemote?.({ html, url, preview, fetchHtml, fetchJson });

    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(enhanced?.variants).toHaveLength(2);
    expect(enhanced?.variants[0]).toMatchObject({
      label: "Com Box Casal 138x188x62",
      sku: "1417-7265",
      sourcePrice: 6696.9,
      imageUrl: "https://images.tcdn.com.br/img/img_prod/573513/vegas_casal_1417_7265.jpg",
    });
    expect(enhanced?.variants[1]).toMatchObject({
      label: "Com Box Queen 158x198x62",
      sku: "1417-7267",
      sourcePrice: 5599.9,
      imageUrl: "https://images.tcdn.com.br/img/img_prod/573513/vegas_queen_1417_7267.jpg",
    });
    expect(new Set(enhanced?.variants.map((variant) => variant.imageUrl))).toEqual(new Set([
      "https://images.tcdn.com.br/img/img_prod/573513/vegas_casal_1417_7265.jpg",
      "https://images.tcdn.com.br/img/img_prod/573513/vegas_queen_1417_7267.jpg",
    ]));
    expect(enhanced?.images.map((image) => image.url)).toEqual([
      "https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_1.jpg",
      "https://images.tcdn.com.br/img/img_prod/573513/produto_atual_1417_2.jpg",
      "https://images.tcdn.com.br/img/img_prod/573513/vegas_casal_1417_7265.jpg",
      "https://images.tcdn.com.br/img/img_prod/573513/vegas_queen_1417_7267.jpg",
    ]);
  });

  it("extrai Sleep House a partir do JSON público da VTEX quando a URL possui idSku", async () => {
    const url = new URL("https://www.sleephouse.com.br/slug-antigo/p?idSku=93926");
    const fetchJson = vi.fn(async (apiUrl: URL) => ({ url: apiUrl, json: sleepHouseVtexProduct() }));

    const preview = await sleepHouseAdapter.fetchPreview?.({ url, fetchJson });

    expect(fetchJson).toHaveBeenCalledWith(new URL("https://sleephouse.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=skuId%3A93926"));
    expect(preview).toMatchObject({
      title: "Colchão Pikolin - Drift Adjustable - 34 cm",
      brand: "Pikolin",
      category: "Colchão",
      sku: "PK0204_1061",
      sourcePrice: 9026.1,
      compareAtPrice: 11571.93,
      currency: "BRL",
      availability: "AVAILABLE",
    });
    expect(preview?.canonicalUrl).toBe("https://www.sleephouse.com.br/colchao-drift-adjustable-34-cm--pikolin-096-x-203-m-pk0204_1061/p?idSku=93926");
    expect(preview?.images.map((image) => image.url)).toEqual([
      "https://sleephouse.vteximg.com.br/arquivos/ids/169251/Drift_ambiente_ajustado.jpg?v=638948599484770000",
      "https://sleephouse.vteximg.com.br/arquivos/ids/169260/Drift_ambiente_ajustado.jpg?v=638948599486800000",
    ]);
    expect(preview?.variants).toEqual([
      expect.objectContaining({ label: "Solteiro Americano | 0,96 x 2,03 m", sku: "93926", sourcePrice: 9026.1, compareAtPrice: 11571.93, attributes: { tamanhos: "Solteiro Americano - 0,96 x 2,03 M" } }),
      expect.objectContaining({ label: "Queen Size | 1,58 x 1,98 m", sku: "93928", sourcePrice: 13738.94, compareAtPrice: 17614.04, attributes: { tamanhos: "Queen Size - 1,58 X 1,98 M" } }),
    ]);
  });

  it("executa o fallback VTEX após o redirect da URL antiga terminar em 404", async () => {
    const sourceUrl = "https://www.sleephouse.com.br/colchao-drift-adjustable-34-cm-pikolin-096-x-203-m-pk0204_1061/p?idSku=93926";
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.hostname === "sleephouse.vtexcommercestable.com.br") {
        return Response.json(sleepHouseVtexProduct());
      }
      if (url.pathname === "/Sistema/404") {
        return new Response("<html><title>Sistema - Sleep House</title></html>", { status: 404, headers: { "content-type": "text/html" } });
      }
      return new Response(null, {
        status: 301,
        headers: { location: "/Sistema/404?ProductLinkNotFound=colchao-drift-adjustable-34-cm-pikolin-096-x-203-m-pk0204_1061" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const preview = await previewProductFromUrl(sourceUrl);

    expect(preview).toMatchObject({
      title: "Colchão Pikolin - Drift Adjustable - 34 cm",
      sourceUrl,
      extraction: { adapter: "sleep-house" },
    });
    expect(preview.images).toHaveLength(2);
    expect(preview.variants).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toEqual(new URL("https://sleephouse.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=skuId%3A93926"));
    expect(warn).toHaveBeenCalledWith("[Product URL preview] import stage failed", expect.objectContaining({
      stage: "html-fetch",
      adapter: "sleep-house",
      sourceHostname: "www.sleephouse.com.br",
      upstreamStatus: 404,
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("93926");
  });

  it("preserva idSku para o adapter remoto quando um redirect remove a query string", async () => {
    const sourceUrl = "https://www.sleephouse.com.br/slug-antigo/p?idSku=93926";
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.hostname === "sleephouse.vtexcommercestable.com.br") {
        return Response.json(sleepHouseVtexProduct());
      }
      if (url.pathname === "/pagina-redirecionada") {
        return new Response("<html><title>Página redirecionada</title></html>", { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response(null, { status: 301, headers: { location: "/pagina-redirecionada" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const preview = await previewProductFromUrl(sourceUrl);

    expect(preview.title).toBe("Colchão Pikolin - Drift Adjustable - 34 cm");
    expect(preview.variants[0]?.sku).toBe("93926");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toEqual(new URL("https://sleephouse.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=skuId%3A93926"));
  });

  it("registra o status upstream quando o fallback público da Sleep House falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.hostname === "sleephouse.vtexcommercestable.com.br") {
        return new Response("indisponível", { status: 503 });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/html" } });
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(previewProductFromUrl("https://www.sleephouse.com.br/produto/p?idSku=93926")).rejects.toMatchObject({
      code: "fetch-failed",
      details: {
        stage: "public-json-fetch",
        hostname: "sleephouse.vtexcommercestable.com.br",
        upstreamStatus: 503,
      },
    });
    expect(warn).toHaveBeenCalledWith("[Product URL preview] import stage failed", expect.objectContaining({
      stage: "public-json-fetch",
      adapter: "sleep-house",
      sourceHostname: "www.sleephouse.com.br",
      hostname: "sleephouse.vtexcommercestable.com.br",
      upstreamStatus: 503,
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("93926");
  });

  it("extrai Sleep House do skuJson da página canônica sem depender da API", () => {
    const preview = parseProductHtmlWithAdapters(`
      <script>
        vtex.events.addData({"pageCategory":"Product","productCategoryName":"Colchão"});
        var skuJson_0 = {
          "productId":243058788,
          "name":"Colchão Pikolin - Drift Adjustable - 34 cm",
          "available":true,
          "skus":[
            {"sku":93926,"skuname":"Solteiro Americano | 0,96 x 2,03 m","dimensions":{"Tamanhos":"Solteiro Americano - 0,96 x 2,03 M"},"available":true,"listPrice":1157193,"bestPrice":902610,"image":"https://sleephouse.vteximg.com.br/arquivos/ids/169251-292-292/Drift_ambiente_ajustado.jpg?v=1"},
            {"sku":93928,"skuname":"Queen Size | 1,58 x 1,98 m","dimensions":{"Tamanhos":"Queen Size - 1,58 X 1,98 M"},"available":false,"listPrice":1761404,"bestPrice":1373894,"image":"https://sleephouse.vteximg.com.br/arquivos/ids/169260-292-292/Drift_ambiente_ajustado.jpg?v=1"}
          ]
        };
      </script>
      <div class="productDescription">Movimento inteligente <strong>e conforto.</strong></div>
    `, new URL("https://www.sleephouse.com.br/produto/p?idSku=93928"));

    expect(preview.extraction.adapter).toBe("sleep-house");
    expect(preview).toMatchObject({
      title: "Colchão Pikolin - Drift Adjustable - 34 cm",
      category: "Colchão",
      description: "Movimento inteligente e conforto.",
      sourcePrice: 13738.94,
      compareAtPrice: 17614.04,
      availability: "OUT_OF_STOCK",
    });
    expect(preview.variants[0]).toMatchObject({ sku: "93928", sourcePrice: 13738.94, availability: "OUT_OF_STOCK" });
    expect(preview.images[0]?.url).toBe("https://sleephouse.vteximg.com.br/arquivos/ids/169260/Drift_ambiente_ajustado.jpg?v=1");
  });

  it("falha com segurança quando a página Sleep House e a API pública não expõem produto", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url.includes("/api/catalog_system/pub/products/search")) {
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/html" } });
    }));

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(previewProductFromUrl("https://www.sleephouse.com.br/produto-inexistente/p?idSku=00000")).rejects.toMatchObject({
      code: "invalid-response",
      details: { stage: "public-json-normalization" },
    });
    expect(warn).toHaveBeenCalledWith("[Product URL preview] import stage failed", expect.objectContaining({
      stage: "public-json-normalization",
      adapter: "sleep-house",
    }));
  });
});

function sleepHouseVtexProduct() {
  return [{
    productId: "243058788",
    productName: "Colchão Pikolin - Drift Adjustable - 34 cm",
    brand: "Pikolin",
    link: "https://www.sleephouse.com.br/colchao-drift-adjustable-34-cm--pikolin-096-x-203-m-pk0204_1061/p",
    productReference: "PK0204_1061",
    categories: ["/Colchão/", "/Colchão/Por tamanho/"],
    description: "Movimento inteligente e conforto absoluto.",
    items: [
      {
        itemId: "93926",
        name: "Solteiro Americano | 0,96 x 2,03 m",
        variations: ["Tamanhos"],
        Tamanhos: ["Solteiro Americano - 0,96 x 2,03 M"],
        images: [{ imageUrl: "https://sleephouse.vteximg.com.br/arquivos/ids/169251/Drift_ambiente_ajustado.jpg?v=638948599484770000" }],
        sellers: [{ sellerDefault: true, commertialOffer: { Price: 9026.1, ListPrice: 11571.93, AvailableQuantity: 10, IsAvailable: true } }],
      },
      {
        itemId: "93928",
        name: "Queen Size | 1,58 x 1,98 m",
        variations: ["Tamanhos"],
        Tamanhos: ["Queen Size - 1,58 X 1,98 M"],
        images: [{ imageUrl: "https://sleephouse.vteximg.com.br/arquivos/ids/169260/Drift_ambiente_ajustado.jpg?v=638948599486800000" }],
        sellers: [{ sellerDefault: true, commertialOffer: { Price: 13738.94, ListPrice: 17614.04, AvailableQuantity: 100, IsAvailable: true } }],
      },
    ],
  }];
}
