import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ManualProductForm } from "@/components/admin/manual-product-form";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { MANUAL_SUPPLIER_KEY } from "@/lib/admin/manual-product-constants";
import { type Market } from "@/lib/market";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const messages: Record<string, { tone: "error"; text: string }> = {
  error: { tone: "error", text: "Revise os campos do produto manual." },
  "invalid-supplier": { tone: "error", text: "Fornecedor inválido para o mercado selecionado." },
  "slug-in-use": { tone: "error", text: "Já existe uma oferta com este slug neste mercado." },
};

export default async function NewManualProductPage({ searchParams }: Props) {
  await requireAdmin();
  const raw = await searchParams;
  const message = typeof raw.saved === "string" ? messages[raw.saved] : undefined;
  const suppliers = await db.supplier.findMany({
    where: { active: true, adapterKey: { notIn: Object.values(MANUAL_SUPPLIER_KEY) } },
    select: { id: true, name: true, supportedMarkets: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="admin-page max-w-5xl">
      <Link href="/admin/produtos" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand"><ArrowLeft size={16} /> Voltar para produtos</Link>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Cadastro curado</p>
          <h1>Adicionar produto manualmente</h1>
          <p>Crie um produto real escolhido manualmente para BR ou US.</p>
        </div>
      </div>
      {message && <div className={`admin-alert ${message.tone}`}>{message.text}</div>}
      <ManualProductForm suppliers={suppliers.map((supplier) => ({
        ...supplier,
        supportedMarkets: supplier.supportedMarkets as Market[],
      }))} />
    </div>
  );
}
