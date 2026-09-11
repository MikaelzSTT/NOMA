import { describe, expect, it } from "vitest";
import { imagesWithFeaturedVariant } from "@/lib/product-gallery-images";

describe("galeria de produto com variante selecionada", () => {
  const images = [
    { id: "general-1", url: "https://cdn.example.com/vegas-geral-1.jpg", alt: "Simmons Vegas" },
    { id: "general-2", url: "https://cdn.example.com/vegas-geral-2.jpg", alt: "Simmons Vegas detalhe" },
  ];

  it("mantém a galeria principal na ordem original e adiciona imagem selecionada ao fim", () => {
    const visible = imagesWithFeaturedVariant(images, "Simmons Vegas", "https://cdn.example.com/vegas-queen.jpg");

    expect(visible.map((image) => image.url)).toEqual([
      "https://cdn.example.com/vegas-geral-1.jpg",
      "https://cdn.example.com/vegas-geral-2.jpg",
      "https://cdn.example.com/vegas-queen.jpg",
    ]);
  });

  it("usa imagem existente da variante sem duplicar nem reordenar", () => {
    const visible = imagesWithFeaturedVariant(images, "Simmons Vegas", "https://cdn.example.com/vegas-geral-2.jpg");

    expect(visible.map((image) => image.url)).toEqual([
      "https://cdn.example.com/vegas-geral-1.jpg",
      "https://cdn.example.com/vegas-geral-2.jpg",
    ]);
  });

  it("remove URLs duplicadas da galeria base", () => {
    const visible = imagesWithFeaturedVariant([...images, { id: "duplicate", url: "https://cdn.example.com/vegas-geral-1.jpg", alt: "Duplicada" }], "Simmons Vegas");

    expect(visible.map((image) => image.url)).toEqual([
      "https://cdn.example.com/vegas-geral-1.jpg",
      "https://cdn.example.com/vegas-geral-2.jpg",
    ]);
  });
});
