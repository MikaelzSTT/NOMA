import type { Metadata } from "next";
import { EditorialProductListing } from "@/components/editorial-product-listing";
import { getCollectionProducts } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Coleções | NOMA" },
  description: "Explore coleções selecionadas de móveis e interiores NOMA.",
  alternates: { canonical: absoluteUrl("/br/colecoes") },
  openGraph: {
    title: "Coleções | NOMA",
    description: "Explore coleções selecionadas de móveis e interiores NOMA.",
    locale: "pt_BR",
    type: "website",
    url: absoluteUrl("/br/colecoes"),
  },
};

export default async function BrCollectionsPage() {
  const products = await getCollectionProducts({ market: "BR" });

  return (
    <EditorialProductListing
      eyebrow="Seleção editorial"
      title="Coleções NOMA"
      description="Móveis e interiores selecionados por proporção, matéria e conforto, com os sofás NOMA em primeiro plano."
      products={products}
      emptyMessage="Nenhum produto publicado está disponível no momento."
      pageName="colecoes"
    />
  );
}
