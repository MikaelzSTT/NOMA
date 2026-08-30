import { redirect } from "next/navigation";
import { categoryPath } from "@/lib/market";
import { buildPageUrl, type RawSearchParams } from "@/lib/search-params";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export default async function LegacyCategoryPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  redirect(buildPageUrl(categoryPath("BR", slug), raw, typeof raw.page === "string" ? Number(raw.page) || 1 : 1));
}
