import { describe, expect, it } from "vitest";
import { MockSupplierAdapter } from "@/suppliers/adapters/mock-supplier-adapter";

describe("SupplierAdapter", () => {
  const adapter = new MockSupplierAdapter();

  it("declara capacidades sem exigir métodos não suportados", () => {
    expect(adapter.capabilities.has("catalog")).toBe(true);
    expect(adapter.capabilities.has("url-import")).toBe(true);
    expect(adapter.capabilities.has("category-discovery")).toBe(true);
    expect(adapter.supportedDomains).toEqual(["example.com"]);
  });

  it("pagina o catálogo definitivo", async () => {
    const batches = [];
    for await (const batch of adapter.fetchProducts({ limit: 2 })) batches.push(batch);
    expect(batches.flatMap((batch) => batch.products)).toHaveLength(6);
    expect(batches.at(-1)?.isLastPage).toBe(true);
  });

  it("só aceita URLs do domínio e caminho específicos", async () => {
    const supported = new URL("https://example.com/noma-demo/noma-sofa-arco");
    expect(adapter.supportsUrl(supported)).toBe(true);
    expect(adapter.supportsUrl(new URL("https://example.org/produto/1"))).toBe(false);
    await expect(adapter.fetchProductByUrl(supported)).resolves.toEqual(expect.objectContaining({ sku: "SOF-ARCO-001" }));
  });

  it("descobre produtos de uma listagem suportada", async () => {
    const discovery = await adapter.discoverProducts(new URL("https://example.com/noma-demo"));
    expect(discovery.products).toHaveLength(4);
    expect(discovery.products[0]).toMatchObject({ title: "Sofá Arco", productUrl: "https://example.com/noma-demo/noma-sofa-arco" });
    expect(discovery.isLastPage).toBe(false);
    expect(discovery.nextPageUrl).toContain("page=2");
  });
});
