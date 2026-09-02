import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Noma Interiores",
    short_name: "Noma",
    description: "Móveis, interiores e marcenaria para uma vida mais presente.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2efe8",
    theme_color: "#20211d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
