import Link from "next/link";
import { Boxes, FileClock, FileUp, Gauge, LogOut, Store, Truck } from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import { Logo } from "@/components/logo";

const links = [
  { href: "/admin", label: "Visao geral", icon: Gauge },
  { href: "/admin/produtos", label: "Produtos", icon: Boxes },
  { href: "/admin/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/admin/importar", label: "Importar", icon: FileUp },
  { href: "/admin/logs", label: "Logs", icon: FileClock },
];

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="admin-sidebar">
        <div className="px-5 py-5"><Logo /></div>
        <nav className="flex gap-1 overflow-x-auto px-3 lg:flex-col" aria-label="Administracao">
          {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="admin-nav-link"><Icon size={18} />{label}</Link>)}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">
          <p className="truncate px-2 text-xs text-white/60">{email}</p>
          <form action={logoutAction}><button className="admin-nav-link mt-2 w-full"><LogOut size={18} />Sair</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-5 sm:px-8">
          <div className="flex items-center gap-2 text-sm font-bold text-ink"><Store size={18} className="text-brand" /> Operacao do catalogo</div>
          <form action={logoutAction} className="lg:hidden"><button aria-label="Sair" className="icon-button"><LogOut size={18} /></button></form>
        </header>
        <main className="p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
