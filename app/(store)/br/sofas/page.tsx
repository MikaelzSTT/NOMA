import type { Metadata } from "next";
import { EditorialProductListing } from "@/components/editorial-product-listing";
import { getSofaProducts } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Sofás de Luxo | NOMA" },
  description: "Conheça a seleção de sofás premium e de alto padrão da NOMA.",
  alternates: { canonical: absoluteUrl("/br/sofas") },
  openGraph: {
    title: "Sofás de Luxo | NOMA",
    description: "Conheça a seleção de sofás premium e de alto padrão da NOMA.",
    locale: "pt_BR",
    type: "website",
    url: absoluteUrl("/br/sofas"),
  },
};

export default async function BrSofasPage() {
  const products = await getSofaProducts({ market: "BR" });

  return (
    <EditorialProductListing
      eyebrow="Curadoria NOMA"
      title="Sofás de luxo"
      description="Uma seleção de sofás premium pensada para ambientes de presença, conforto e permanência."
      products={products}
      emptyMessage="Nenhum sofá publicado está disponível no momento."
      pageName="sofas"
    />
  );
}
