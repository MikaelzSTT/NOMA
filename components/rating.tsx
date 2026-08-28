import { Star } from "lucide-react";

export function Rating({ value, count }: { value?: number | null; count?: number | null }) {
  if (value == null) return <span className="text-xs text-muted">Sem avaliacoes</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" aria-label={`${value} de 5 estrelas`}>
      <Star className="fill-warning text-warning" size={14} aria-hidden="true" />
      <strong className="font-bold text-ink">{value.toFixed(1)}</strong>
      {count != null && <span>({count.toLocaleString("pt-BR")})</span>}
    </span>
  );
}
