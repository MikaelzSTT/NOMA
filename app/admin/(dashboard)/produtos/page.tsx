import Image from "next/image";
import Link from "next/link";
import { Archive, Pencil, Plus, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { archiveProductAction, toggleProductAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { MARKET_CONFIG, isMarket, type Market } from "@/lib/market";
import { formatMoney } from "@/lib/utils";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminProductsPage({ searchParams }: Props) {
  await requireAdmin();
  const raw = await searchParams;
  const query = typeof raw.q === "string" ? raw.q.slice(0, 120) : "";
  const status = typeof raw.status === "string" ? raw.status : "";
  const supplierId = typeof raw.supplier === "string" ? raw.supplier : "";
  const categoryId = typeof raw.category === "string" ? raw.category : "";
  const marketParam = typeof raw.market === "string" && isMarket(raw.market.toUpperCase()) ? raw.market.toUpperCase() as Market : "";
  const statusWhere = {
    error: { syncStatus: "ERROR" },
    unavailable: { availability: { in: ["OUT_OF_STOCK", "REMOVED"] } },
    "no-price": { sellingPrice: null },
    inactive: { active: false, archivedAt: null },
    archived: { archivedAt: { not: null } },
  }[status] as Prisma.ProductWhereInput | undefined;
  const [products, suppliers, categories] = await Promise.all([
    db.product.findMany({
      where: {
        ...statusWhere,
        ...(supplierId ? { supplierId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(marketParam ? { offers: { some: { market: marketParam } } } : {}),
        ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" as const } }, { sku: { contains: query, mode: "insensitive" as const } }, { supplierProductId: { contains: query, mode: "insensitive" as const } }] } : {}),
      },
      include: { images: { orderBy: { position: "asc" }, take: 1 }, supplier: true, category: true, offers: { include: { supplier: true }, orderBy: [{ market: "asc" }, { updatedAt: "desc" }] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.supplier.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="admin-page">
      <div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Produtos</h1><p>Custos são internos; somente o preço de venda chega à vitrine pública.</p></div><div className="flex flex-wrap gap-3"><Link href="/admin/produtos/novo" className="button-primary"><Plus size={17} /> Adicionar produto manualmente</Link><Link href="/admin/importar" className="button-secondary">Importar produtos</Link></div></div>
      {raw.archived === "ok" && <div className="admin-alert success">Produto arquivado. Ele pode ser localizado pelo filtro “Arquivados”.</div>}
      <form className="admin-search flex-wrap">
        <Search size={18} /><input name="q" defaultValue={query} placeholder="Título, SKU ou ID do fornecedor" />
        <select name="market" defaultValue={marketParam}><option value="">Todos os mercados</option><option value="BR">Brasil</option><option value="US">United States</option></select>
        <select name="supplier" defaultValue={supplierId}><option value="">Todos os fornecedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
        <select name="category" defaultValue={categoryId}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select name="status" defaultValue={status}><option value="">Todos os estados</option><option value="error">Com erro</option><option value="unavailable">Indisponíveis</option><option value="no-price">Sem preço</option><option value="inactive">Inativos</option><option value="archived">Arquivados</option></select>
        <button className="button-primary">Buscar</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Produto</th><th>Mercado</th><th>Fornecedor</th><th>Categoria</th><th>Custo</th><th>Venda</th><th>Margem</th><th>Estoque</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{products.map((product) => {
            const selectedOffer = marketParam ? product.offers.find((offer) => offer.market === marketParam) : product.offers[0];
            const cost = selectedOffer?.costPrice == null ? null : Number(selectedOffer.costPrice);
            const selling = selectedOffer?.sellingPrice == null ? null : Number(selectedOffer.sellingPrice);
            const margin = cost != null && selling != null ? selling - cost : null;
            const currency = selectedOffer?.currency ?? product.currency;
            return <tr key={product.id}>
              <td><div className="flex min-w-64 items-center gap-3"><span className="relative size-11 shrink-0 overflow-hidden rounded-sm bg-surface">{product.images[0] && <Image src={product.images[0].url} alt="" fill sizes="44px" className="object-cover" />}</span><span><strong className="block text-sm text-ink">{product.title}</strong><small className="text-muted">{product.sku}</small>{product.syncError && <small className="mt-1 block max-w-48 truncate text-red-700" title={product.syncError}>{product.syncError}</small>}</span></div></td>
              <td>{selectedOffer ? MARKET_CONFIG[selectedOffer.market].label : "Sem oferta"}</td><td>{selectedOffer?.supplier.name ?? product.supplier.name}</td><td>{product.category.name}</td><td>{cost == null ? "—" : formatMoney(cost, currency)}</td><td>{selling == null ? "Sem preço" : formatMoney(selling, currency)}</td><td>{margin == null ? "—" : formatMoney(margin, currency)}</td><td>{selectedOffer?.stockQuantity ?? product.stock}</td>
              <td><form action={toggleProductAction}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="active" value={String(!product.active)} /><button className={`status-pill ${product.active && !product.archivedAt ? "active" : "inactive"}`}>{product.archivedAt ? "Arquivado" : product.active ? "Ativo" : "Inativo"}</button></form></td>
              <td><div className="flex gap-1"><Link href={`/admin/produtos/${product.id}`} className="icon-button" title="Editar produto"><Pencil size={17} /><span className="sr-only">Editar</span></Link>{!product.archivedAt && <form action={archiveProductAction}><input type="hidden" name="id" value={product.id} /><button className="icon-button" title="Arquivar produto"><Archive size={17} /><span className="sr-only">Arquivar</span></button></form>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {products.length === 100 && <p className="mt-3 text-xs text-muted">Exibindo os 100 resultados mais recentes. Refine os filtros para localizar outros itens.</p>}
    </div>
  );
}
