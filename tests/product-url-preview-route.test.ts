import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/product-url-preview/route";

vi.mock("@/lib/api-auth", () => ({
  requireApiAdmin: vi.fn(async () => null),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async () => [{ address: "203.0.113.10" }]),
  },
}));

describe("POST /api/admin/product-url-preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("importa Sleep House após redirect e 404 da página original", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.hostname === "sleephouse.vtexcommercestable.com.br") {
        return Response.json(vtexProduct());
      }
      if (url.pathname === "/Sistema/404") {
        return new Response("<html><title>Sistema - Sleep House</title></html>", { status: 404, headers: { "content-type": "text/html" } });
      }
      return new Response(null, {
        status: 301,
        headers: { location: "/Sistema/404?ProductLinkNotFound=colchao-drift-adjustable" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(new Request("https://noma.test/api/admin/product-url-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://www.sleephouse.com.br/colchao-drift-adjustable-34-cm-pikolin-096-x-203-m-pk0204_1061/p?idSku=93926",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      title: "Colchão Pikolin - Drift Adjustable - 34 cm",
      brand: "Pikolin",
      sourcePrice: 9026.1,
      extraction: { adapter: "sleep-house" },
    });
    expect(body.variants).toHaveLength(1);
    expect(body.images).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith("[Product URL preview] import stage failed", expect.objectContaining({
      stage: "html-fetch",
      upstreamStatus: 404,
    }));
  });
});

function vtexProduct() {
  return [{
    productId: "243058788",
    productName: "Colchão Pikolin - Drift Adjustable - 34 cm",
    brand: "Pikolin",
    link: "https://www.sleephouse.com.br/colchao-drift-adjustable-34-cm--pikolin-096-x-203-m-pk0204_1061/p",
    productReference: "PK0204_1061",
    categories: ["/Colchão/"],
    description: "Movimento inteligente e conforto absoluto.",
    items: [{
      itemId: "93926",
      name: "Solteiro Americano | 0,96 x 2,03 m",
      variations: ["Tamanhos"],
      Tamanhos: ["Solteiro Americano - 0,96 x 2,03 M"],
      images: [{ imageUrl: "https://sleephouse.vteximg.com.br/arquivos/ids/169251/Drift_ambiente_ajustado.jpg" }],
      sellers: [{ sellerDefault: true, commertialOffer: { Price: 9026.1, ListPrice: 11571.93, AvailableQuantity: 10, IsAvailable: true } }],
    }],
  }];
}
