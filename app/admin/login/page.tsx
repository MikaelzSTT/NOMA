import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/logo";
import { getAdminSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Acesso administrativo", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-5">
      <section className="w-full max-w-sm rounded-md border border-border bg-white p-7 shadow-lg">
        <Logo />
        <p className="eyebrow mt-8">Area restrita</p>
        <h1 className="mt-1 text-2xl font-black text-ink">Painel administrativo</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Use as credenciais configuradas no ambiente.</p>
        <LoginForm />
      </section>
    </main>
  );
}
