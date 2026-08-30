import type { Metadata } from "next";
import { NomaHomePage } from "@/components/home/noma-home-page";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Noma — Móveis & Interiores" },
  description: "Móveis, interiores e marcenaria sob medida desenhados para uma vida com menos ruído e mais presença.",
  alternates: {
    canonical: absoluteUrl("/br"),
    languages: { "pt-BR": absoluteUrl("/br"), "en-US": absoluteUrl("/us") },
  },
  openGraph: {
    title: "Noma — Móveis & Interiores",
    description: "Design que habita o seu tempo.",
    locale: "pt_BR",
    url: absoluteUrl("/br"),
    siteName: "Noma",
    images: [{ url: "/images/noma/living-room.webp", width: 1672, height: 941, alt: "Interior contemporâneo Noma" }],
  },
};

export default function BrHomePage() {
  return <NomaHomePage market="BR" />;
}
