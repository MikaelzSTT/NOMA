import { describe, expect, it } from "vitest";
import { imagesWithFeaturedVariant } from "@/lib/product-gallery-images";

describe("galeria de produto com variante selecionada", () => {
  const images = [
    { id: "general-1", url: "https://cdn.example.com/vegas-geral-1.jpg", alt: "Simmons Vegas" },
    { id: "general-2", url: "https://cdn.example.com/vegas-geral-2.jpg", alt: "Simmons Vegas detalhe" },
  ];

  it("usa imageUrl da variante selecionada como imagem principal sem perder a galeria geral", () => {
    const visible = imagesWithFeaturedVariant(images, "Simmons Vegas", "https://cdn.example.com/vegas-queen.jpg");

    expect(visible.map((image) => image.url)).toEqual([
      "https://cdn.example.com/vegas-queen.jpg",
      "https://cdn.example.com/vegas-geral-1.jpg",
      "https://cdn.example.com/vegas-geral-2.jpg",
    ]);
  });

  it("move imagem existente da variante para a frente sem duplicar", () => {
    const visible = imagesWithFeaturedVariant(images, "Simmons Vegas", "https://cdn.example.com/vegas-geral-2.jpg");

    expect(visible.map((image) => image.url)).toEqual([
      "https://cdn.example.com/vegas-geral-2.jpg",
      "https://cdn.example.com/vegas-geral-1.jpg",
    ]);
  });
});
