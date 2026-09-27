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
    icons: [
      { src: "/icons/noma-icon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/icons/noma-icon-96.png", sizes: "96x96", type: "image/png" },
      { src: "/icons/noma-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/noma-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
