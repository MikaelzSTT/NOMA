import { describe, expect, it } from "vitest";
import { productImageStorageFields } from "@/lib/product-image-storage";

describe("productImageStorageFields", () => {
  it("preserva caminhos locais como armazenados", () => {
    expect(productImageStorageFields("/images/noma/products.webp")).toEqual({
      storageKey: "/images/noma/products.webp",
      storageStatus: "STORED",
    });
  });

  it("marca imagens do Vercel Blob como armazenadas", () => {
    expect(productImageStorageFields("https://abc.public.blob.vercel-storage.com/products/cadeira.webp")).toEqual({
      storageKey: "products/cadeira.webp",
      storageStatus: "STORED",
    });
  });

  it("mantem imagens externas como externas", () => {
    expect(productImageStorageFields("https://cdn.example.com/cadeira.jpg")).toEqual({
      storageKey: null,
      storageStatus: "EXTERNAL",
    });
  });
});
