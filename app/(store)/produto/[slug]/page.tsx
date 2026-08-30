import { redirect } from "next/navigation";
import { productPath } from "@/lib/market";

type Props = { params: Promise<{ slug: string }> };

export default async function LegacyProductPage({ params }: Props) {
  const { slug } = await params;
  redirect(productPath("BR", slug));
}
