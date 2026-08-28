"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortSelect({ value }: { value: string }) {
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
      aria-label="Ordenar produtos"
    >
      <option value="relevance">Relevancia</option>
      <option value="price-asc">Menor preco</option>
      <option value="price-desc">Maior preco</option>
      <option value="discount">Maior desconto</option>
      <option value="rating">Melhor avaliacao</option>
      <option value="newest">Mais recentes</option>
    </select>
  );
}
