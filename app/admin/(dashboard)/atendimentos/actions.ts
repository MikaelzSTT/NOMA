"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const statusUpdateSchema = z.object({
  id: z.string().trim().min(1).max(120),
  status: z.enum(["NEW", "CONTACTED", "WON", "LOST"]),
});

export async function updateAssistedPurchaseStatusAction(formData: FormData) {
  await requireAdmin();
  const parsed = statusUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db.assistedPurchaseRequest.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });
  revalidatePath("/admin/atendimentos");
}
