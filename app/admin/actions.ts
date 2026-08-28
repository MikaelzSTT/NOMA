"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SyncOperation } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { clearAdminSession, createAdminSession, requireAdmin, validateAdminCredentials } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncProducts } from "@/services/sync-products";
import { calculateSellingPrice } from "@/services/pricing";
import { calculateDiscount, slugify } from "@/lib/utils";
import { encryptSupplierCredentials } from "@/lib/supplier-secrets";

export interface LoginState { error?: string }

const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Informe e-mail e senha validos." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!checkRateLimit(`admin-login:${ip}`, env.ADMIN_RATE_LIMIT_PER_MINUTE).allowed) {
    return { error: "Muitas tentativas. Aguarde antes de tentar novamente." };
  }
  try {
    if (!(await validateAdminCredentials(parsed.data.email, parsed.data.password))) {
      return { error: "Credenciais invalidas." };
    }
    await createAdminSession();
  } catch {
    return { error: "Admin nao configurado. Revise as variaveis de ambiente." };
  }
  redirect("/admin");
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function runManualSyncAction() {
  const session = await requireAdmin();
  if (!checkRateLimit(`admin-sync:${session.email}`, 3).allowed) {
    redirect("/admin?sync=rate-limit");
  }
  let processed = 0;
  try {
    const result = await syncProducts({ operation: SyncOperation.MANUAL, incremental: true });
    processed = result.processed;
  } catch {
    redirect("/admin?sync=error");
  }
  revalidatePath("/", "layout");
  redirect(`/admin?sync=ok&processed=${processed}`);
}

const editProductSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2).max(300),
  shortDescription: z.string().trim().max(800).optional(),
  description: z.string().trim().max(30_000).optional(),
  category: z.string().trim().min(2).max(120),
  subcategory: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  costPrice: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().nonnegative().optional()),
  sellingPrice: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().nonnegative().optional()),
  compareAtPrice: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().nonnegative().optional()),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  stock: z.coerce.number().int().nonnegative(),
  availability: z.enum(["AVAILABLE", "OUT_OF_STOCK", "PREORDER", "UNKNOWN"]),
  shippingCost: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().nonnegative().optional()),
  estimatedDelivery: z.string().trim().max(300).optional(),
  pricingRuleType: z.enum(["FIXED_MARGIN", "MARKUP"]).optional(),
  pricingRuleValue: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().nonnegative().optional()),
  manualPriceOverride: z.boolean().default(false),
  images: z.array(z.string().trim().min(1).refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "URL de imagem inválida")).max(30),
  internalNotes: z.string().trim().max(2_000).optional(),
  popularityScore: z.coerce.number().int().min(0).max(1_000_000),
  active: z.coerce.boolean().default(false),
  featured: z.coerce.boolean().default(false),
});

export async function updateInternalProductAction(formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  const parsed = editProductSchema.safeParse({
    ...raw,
    shortDescription: String(formData.get("shortDescription") ?? "").trim() || undefined,
    description: String(formData.get("description") ?? "").trim() || undefined,
    subcategory: String(formData.get("subcategory") ?? "").trim() || undefined,
    brand: String(formData.get("brand") ?? "").trim() || undefined,
    estimatedDelivery: String(formData.get("estimatedDelivery") ?? "").trim() || undefined,
    pricingRuleType: String(formData.get("pricingRuleType") ?? "") || undefined,
    internalNotes: String(formData.get("internalNotes") ?? "").trim() || undefined,
    images: String(formData.get("images") ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    manualPriceOverride: formData.get("manualPriceOverride") === "true",
    active: formData.get("active") === "true",
    featured: formData.get("featured") === "true",
  });
  if (!parsed.success) redirect(`/admin/produtos/${String(formData.get("id"))}?saved=error`);
  const { id, category: categoryName, brand: brandName, images, ...input } = parsed.data;
  const [category, brand] = await Promise.all([
    db.category.upsert({ where: { slug: slugify(categoryName) }, update: { name: categoryName }, create: { name: categoryName, slug: slugify(categoryName) } }),
    brandName ? db.brand.upsert({ where: { slug: slugify(brandName) }, update: { name: brandName }, create: { name: brandName, slug: slugify(brandName) } }) : null,
  ]);
  const sellingPrice = input.manualPriceOverride
    ? input.sellingPrice
    : input.costPrice != null && input.pricingRuleType && input.pricingRuleValue != null
      ? calculateSellingPrice(input.costPrice, { type: input.pricingRuleType, value: input.pricingRuleValue })
      : input.sellingPrice;
  await db.$transaction(async (transaction) => {
    const previous = await transaction.product.findUnique({ where: { id }, select: { sellingPrice: true } });
    await transaction.product.update({
      where: { id },
      data: {
        ...input,
        shortDescription: input.shortDescription ?? null,
        description: input.description ?? null,
        subcategory: input.subcategory ?? null,
        costPrice: input.costPrice ?? null,
        sellingPrice: sellingPrice ?? null,
        compareAtPrice: input.compareAtPrice ?? null,
        discountPercent: calculateDiscount(sellingPrice, input.compareAtPrice),
        shippingCost: input.shippingCost ?? null,
        estimatedDelivery: input.estimatedDelivery ?? null,
        pricingRuleType: input.pricingRuleType ?? null,
        pricingRuleValue: input.pricingRuleValue ?? null,
        categoryId: category.id,
        brandId: brand?.id ?? null,
        images: { deleteMany: {}, create: images.map((url, position) => ({ url, sourceUrl: url, storageKey: url.startsWith("/") ? url : null, storageStatus: url.startsWith("/") ? "STORED" : "EXTERNAL", position, isPrimary: position === 0, alt: input.title })) },
      },
    });
    if (sellingPrice != null && Number(previous?.sellingPrice) !== sellingPrice) {
      await transaction.priceHistory.create({ data: { productId: id, sellingPrice, compareAtPrice: previous?.sellingPrice, costPrice: input.costPrice, currency: input.currency } });
    }
  });
  revalidatePath(`/admin/produtos/${id}`);
  revalidatePath("/", "layout");
  redirect(`/admin/produtos/${id}?saved=ok`);
}

export async function toggleProductAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().min(1), active: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  await db.product.update({ where: { id: parsed.id }, data: { active: parsed.active === "true", ...(parsed.active === "true" ? { archivedAt: null } : {}) } });
  revalidatePath("/admin/produtos");
  revalidatePath("/", "layout");
}

export async function archiveProductAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  await db.product.update({ where: { id }, data: { active: false, archivedAt: new Date() } });
  revalidatePath("/admin/produtos");
  revalidatePath("/", "layout");
  redirect("/admin/produtos?archived=ok");
}

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(160),
  adapterKey: z.string().trim().min(2).max(120).regex(/^[a-z0-9][a-z0-9-]*$/),
  baseUrl: z.preprocess((value) => value === "" ? undefined : value, z.url().optional()),
  settings: z.record(z.string(), z.unknown()),
  credentials: z.record(z.string(), z.string()),
  active: z.boolean(),
  authorized: z.boolean(),
});

export async function saveSupplierAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "") || undefined;
  let rawSettings: unknown = {};
  let credentials: unknown = {};
  try {
    rawSettings = JSON.parse(String(formData.get("settings") ?? "{}") || "{}");
    credentials = JSON.parse(String(formData.get("credentials") ?? "{}") || "{}");
  } catch {
    redirect(`/admin/fornecedores?saved=invalid-json${id ? `&id=${id}` : ""}`);
  }
  const parsed = supplierSchema.safeParse({
    ...Object.fromEntries(formData), id, settings: rawSettings, credentials,
    active: formData.get("active") === "true",
    authorized: formData.get("authorized") === "true",
  });
  if (!parsed.success) redirect(`/admin/fornecedores?saved=error${id ? `&id=${id}` : ""}`);
  const { credentials: credentialValues, id: supplierId, settings: parsedSettings, ...data } = parsed.data;
  const supplierSettings = parsedSettings as Prisma.InputJsonValue;
  const credentialsEncrypted = Object.keys(credentialValues).length ? encryptSupplierCredentials(credentialValues) : undefined;
  if (supplierId) {
    await db.supplier.update({ where: { id: supplierId }, data: { ...data, settings: supplierSettings, ...(credentialsEncrypted ? { credentialsEncrypted } : {}) } });
    await db.product.updateMany({ where: { supplierId }, data: { supplierName: data.name } });
  } else {
    await db.supplier.create({ data: { ...data, settings: supplierSettings, slug: slugify(data.name), ...(credentialsEncrypted ? { credentialsEncrypted } : {}) } });
  }
  revalidatePath("/admin/fornecedores");
  revalidatePath("/admin/importar");
  redirect("/admin/fornecedores?saved=ok");
}
