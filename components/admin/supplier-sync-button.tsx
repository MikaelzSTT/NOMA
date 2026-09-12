"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";
import { syncProductWithSupplierAction } from "@/app/admin/actions";
import type { Market } from "@/lib/market";

export function SupplierSyncButton({ productId, market, disabled = false }: { productId: string; market: Market; disabled?: boolean }) {
  return (
    <form action={syncProductWithSupplierAction}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="market" value={market} />
      <SubmitButton disabled={disabled} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button-secondary" disabled={disabled || pending}>
      {pending ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />}
      {pending ? "Sincronizando..." : "Sincronizar com fornecedor"}
    </button>
  );
}
