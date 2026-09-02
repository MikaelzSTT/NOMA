import { Star } from "lucide-react";
import type { Market } from "@/lib/market";

export function Rating({ value, count, market = "BR" }: { value?: number | null; count?: number | null; market?: Market }) {
  const isUS = market === "US";
  if (value == null) return <span className="noma-rating text-xs text-muted">{isUS ? "No reviews" : "Sem avaliações"}</span>;
  return (
    <span className="noma-rating inline-flex items-center gap-1 text-xs text-muted" aria-label={isUS ? `${value} out of 5 stars` : `${value} de 5 estrelas`}>
      <Star className="fill-warning text-warning" size={14} aria-hidden="true" />
      <strong className="font-bold text-ink">{value.toFixed(1)}</strong>
      {count != null && <span>({count.toLocaleString(isUS ? "en-US" : "pt-BR")})</span>}
    </span>
  );
}
