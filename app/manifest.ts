import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vitrineo",
    short_name: "Vitrineo",
    description: "Produtos e ofertas de fontes identificadas.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#087f5b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
