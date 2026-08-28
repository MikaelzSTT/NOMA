import { describe, expect, it } from "vitest";
import { normalizeMappedRow, suggestColumnMapping } from "@/services/file-import";

describe("mapeamento de planilha", () => {
  it("sugere aliases em português e normaliza valores comerciais", () => {
    const columns = ["Nome Produto", "Preço Atacado", "SKU fornecedor", "Foto", "Estoque"];
    const mapping = suggestColumnMapping(columns);
    expect(mapping).toMatchObject({ "Nome Produto": "title", "Preço Atacado": "costPrice", "SKU fornecedor": "sku", Foto: "images", Estoque: "stock" });
    const product = normalizeMappedRow({ "Nome Produto": "Sofá", "Preço Atacado": "R$ 1.234,56", "SKU fornecedor": "S-1", Foto: "https://example.com/a.jpg", Estoque: 4 }, mapping);
    expect(product).toMatchObject({ title: "Sofá", costPrice: 1234.56, sku: "S-1", supplierProductId: "S-1", stock: 4, availability: "AVAILABLE" });
  });
});
