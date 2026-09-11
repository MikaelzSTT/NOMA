import { describe, expect, it } from "vitest";
import { previewProductFromUrl } from "@/lib/product-import/url-importer";

const liveIt = process.env.RUN_LIVE_PRODUCT_IMPORT === "1" ? it : it.skip;

describe("importação live de produto por URL", () => {
  liveIt("importa a URL antiga da Sleep House pela API pública real da VTEX", async () => {
    const preview = await previewProductFromUrl(
      "https://www.sleephouse.com.br/colchao-drift-adjustable-34-cm-pikolin-096-x-203-m-pk0204_1061/p?idSku=93926",
    );

    expect(preview).toMatchObject({
      title: "Colchão Pikolin - Drift Adjustable - 34 cm",
      brand: "Pikolin",
      sku: "PK0204_1061",
      extraction: { adapter: "sleep-house" },
    });
    expect(preview.images).toHaveLength(27);
    expect(preview.variants).toHaveLength(3);
    expect(preview.variants.map((variant) => variant.sku)).toContain("93926");
  }, 30_000);
});
