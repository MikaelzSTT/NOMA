import Link from "next/link";
import { Layers3 } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-ink" aria-label="Vitrineo - inicio">
      <span className="grid size-9 place-items-center rounded-md bg-brand text-white shadow-sm">
        <Layers3 aria-hidden="true" size={20} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="text-xl font-extrabold tracking-normal">
          vitrine<span className="text-coral">o</span>
        </span>
      )}
    </Link>
  );
}
