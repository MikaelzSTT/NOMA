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
      { src: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { src: "/icon.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
