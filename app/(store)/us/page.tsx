import type { Metadata } from "next";
import { NomaHomePage } from "@/components/home/noma-home-page";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Noma — Furniture & Interiors" },
  description: "Furniture, interiors, and custom millwork designed for a quieter, more intentional home.",
  alternates: {
    canonical: absoluteUrl("/us"),
    languages: { "pt-BR": absoluteUrl("/br"), "en-US": absoluteUrl("/us") },
  },
  openGraph: {
    title: "Noma — Furniture & Interiors",
    description: "Design that lives with your time.",
    locale: "en_US",
    url: absoluteUrl("/us"),
    siteName: "Noma",
    images: [{ url: "/images/noma/living-room.webp", width: 1672, height: 941, alt: "Contemporary Noma interior" }],
  },
};

export default function UsHomePage() {
  return <NomaHomePage market="US" />;
}
