import Link from "next/link";
import { PackageSearch } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-6 text-center">
      <div><PackageSearch className="mx-auto text-brand" size={48} /><p className="eyebrow mt-5">Erro 404</p><h1 className="mt-2 text-3xl font-black text-ink">Pagina nao encontrada</h1><p className="mt-3 text-muted">O produto ou a pagina pode ter sido removido.</p><Link href="/" className="button-primary mt-6">Voltar ao inicio</Link></div>
    </main>
  );
}
