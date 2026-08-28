import { describe, expect, it } from "vitest";
import { deduplicateProducts } from "@/services/sync-products";
import { MOCK_CATALOG } from "@/suppliers/mock-catalog";

describe("deduplicação", () => {
  it("mantém somente a versão mais recente do ID do fornecedor", () => {
    const original = MOCK_CATALOG[0]!;
    const updated = { ...original, sellingPrice: 199.9 };
    const result = deduplicateProducts([original, MOCK_CATALOG[1]!, updated]);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.supplierProductId === original.supplierProductId)?.sellingPrice).toBe(199.9);
  });
});
