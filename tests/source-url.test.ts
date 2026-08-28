import { describe, expect, it } from "vitest";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";

describe("normalização de URL de origem", () => {
  it("remove rastreadores, hash e barra final", () => {
    expect(normalizeSourceUrl("https://EXAMPLE.com/produto/abc/?utm_source=x&b=2&a=1#detalhe")).toBe("https://example.com/produto/abc?a=1&b=2");
  });
});
