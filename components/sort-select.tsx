"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Market } from "@/lib/market";

export function SortSelect({ value, market = "BR" }: { value: string; market?: Market }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <select
      value={value}
      className="select-field min-w-44"
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("sort", event.target.value);
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`);
      }}
      aria-label={market === "US" ? "Sort products" : "Ordenar produtos"}
    >
      <option value="relevance">{market === "US" ? "Relevance" : "Relevancia"}</option>
      <option value="price-asc">{market === "US" ? "Lowest price" : "Menor preco"}</option>
      <option value="price-desc">{market === "US" ? "Highest price" : "Maior preco"}</option>
      <option value="discount">{market === "US" ? "Biggest discount" : "Maior desconto"}</option>
      <option value="rating">{market === "US" ? "Best rated" : "Melhor avaliacao"}</option>
      <option value="newest">{market === "US" ? "Newest" : "Mais recentes"}</option>
    </select>
  );
}
