import { describe, expect, it } from "vitest";
import { getProductDisplayTitle } from "@/lib/product-display";

describe("getProductDisplayTitle", () => {
  it("corrige o nome público do Padova sem depender do slug", () => {
    expect(getProductDisplayTitle("Padova")).toBe("Sofá Padova By Natuzzi Group");
    expect(getProductDisplayTitle("Sofa Padova")).toBe("Sofá Padova By Natuzzi Group");
    expect(getProductDisplayTitle("Sofá Padova By Natuzzi Group")).toBe("Sofá Padova By Natuzzi Group");
  });

  it("preserva os demais títulos", () => {
    expect(getProductDisplayTitle("Sofá Arco")).toBe("Sofá Arco");
    expect(getProductDisplayTitle("Padova", "US")).toBe("Padova");
  });
});
