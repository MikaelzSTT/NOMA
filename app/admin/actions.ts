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
import { MARKET_CONFIG, isMarket, type Market } from "@/lib/market";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncProducts } from "@/services/sync-products";
import { calculateSellingPrice } from "@/services/pricing";
import { calculateDiscount, slugify } from "@/lib/utils";
import { encryptSupplierCredentials } from "@/lib/supplier-secrets";
import { ManualProductError, createManualProduct } from "@/lib/admin/manual-products";

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

const sourceUrl = z.string().trim().url().refine((value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Use uma URL HTTP/HTTPS.");

const imageUrl = z.string().trim().min(1).refine((value) => {
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}, "Use HTTPS ou caminho local iniciado por /.");

const optionalMoney = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().nonnegative().optional());
const requiredMoney = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().nonnegative());
const availabilitySchema = z.enum(["AVAILABLE", "OUT_OF_STOCK", "PREORDER", "UNKNOWN"]);
const variantSchema = z.object({
  label: z.string().trim().min(1).max(300),
  sku: z.string().trim().max(255).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  costPrice: requiredMoney,
  salePrice: requiredMoney,
  compareAtPrice: optionalMoney,
  stock: z.coerce.number().int().nonnegative(),
  active: z.boolean().default(false),
  availability: availabilitySchema,
  sourceUrl: sourceUrl.optional(),
  imageUrl: imageUrl.optional(),
  isDefault: z.boolean().default(false),
});
const variantsSchema = z.array(variantSchema).min(1).max(200).transform((variants) => {
  const defaultIndex = Math.max(0, variants.findIndex((variant) => variant.isDefault));
  return variants.map((variant, index) => ({ ...variant, isDefault: index === defaultIndex }));
});

const createManualProductSchema = z.object({
  market: z.string().transform((value) => value.toUpperCase()).refine(isMarket),
  supplierId: z.string().trim().min(1),
  sourceUrl,
  title: z.string().trim().min(2).max(300),
  slug: z.string().trim().min(2).max(180).transform(slugify).refine((value) => value.length >= 2),
  description: z.string().trim().max(30_000).optional(),
  brand: z.string().trim().max(120).optional(),
  category: z.string().trim().min(2).max(120),
  images: z.array(imageUrl).min(1).max(30),
  costPrice: requiredMoney,
  sellingPrice: requiredMoney,
  compareAtPrice: optionalMoney,
  stock: z.coerce.number().int().nonnegative(),
  availability: availabilitySchema,
  estimatedDeliveryMinDays: z.coerce.number().int().nonnegative(),
  estimatedDeliveryMaxDays: z.coerce.number().int().nonnegative(),
  featured: z.boolean().default(false),
  active: z.boolean().default(false),
  variants: variantsSchema,
}).refine((value) => value.estimatedDeliveryMaxDays >= value.estimatedDeliveryMinDays, {
  path: ["estimatedDeliveryMaxDays"],
});

export async function createManualProductAction(formData: FormData) {
  await requireAdmin();
  const variants = parseVariants(formData);
  if (!variants) redirect("/admin/produtos/novo?saved=error");
  const parsed = createManualProductSchema.safeParse({
    ...Object.fromEntries(formData),
    description: String(formData.get("description") ?? "").trim() || undefined,
    brand: String(formData.get("brand") ?? "").trim() || undefined,
    images: String(formData.get("images") ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    featured: formData.get("featured") === "true",
    active: formData.get("active") === "true",
    variants,
  });
  if (!parsed.success) redirect("/admin/produtos/novo?saved=error");

  let created: Awaited<ReturnType<typeof createManualProduct>>;
  try {
    created = await createManualProduct(parsed.data);
  } catch (error) {
    const code = error instanceof ManualProductError ? error.code : "error";
    redirect(`/admin/produtos/novo?saved=${code}`);
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/", "layout");
  redirect(`/admin/produtos/${created.productId}?saved=created&market=${created.market}`);
}

const editProductSchema = z.object({
  id: z.string().min(1),
  market: z.string().transform((value) => value.toUpperCase()).refine(isMarket),
  title: z.string().trim().min(2).max(300),
  sourceUrl: sourceUrl.optional(),
  shortDescription: z.string().trim().max(800).optional(),
  description: z.string().trim().max(30_000).optional(),
  category: z.string().trim().min(2).max(120),
  subcategory: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  costPrice: optionalMoney,
  sellingPrice: optionalMoney,
  compareAtPrice: optionalMoney,
  stock: z.coerce.number().int().nonnegative(),
  availability: z.enum(["AVAILABLE", "OUT_OF_STOCK", "PREORDER", "UNKNOWN"]),
  shippingCost: optionalMoney,
  estimatedDelivery: z.string().trim().max(300).optional(),
  estimatedDeliveryMinDays: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().nonnegative().optional()),
  estimatedDeliveryMaxDays: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().nonnegative().optional()),
  pricingRuleType: z.enum(["FIXED_MARGIN", "MARKUP"]).optional(),
  pricingRuleValue: optionalMoney,
  manualPriceOverride: z.boolean().default(false),
  images: z.array(imageUrl).max(30),
  variants: variantsSchema,
  internalNotes: z.string().trim().max(2_000).optional(),
  popularityScore: z.coerce.number().int().min(0).max(1_000_000),
  active: z.coerce.boolean().default(false),
  featured: z.coerce.boolean().default(false),
}).refine((value) => value.estimatedDeliveryMaxDays == null || value.estimatedDeliveryMinDays == null || value.estimatedDeliveryMaxDays >= value.estimatedDeliveryMinDays, {
  path: ["estimatedDeliveryMaxDays"],
});

export async function updateInternalProductAction(formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  const variants = parseVariants(formData);
  if (!variants) redirect(`/admin/produtos/${String(formData.get("id"))}?saved=error`);
  const parsed = editProductSchema.safeParse({
    ...raw,
    sourceUrl: String(formData.get("sourceUrl") ?? "").trim() || undefined,
    shortDescription: String(formData.get("shortDescription") ?? "").trim() || undefined,
    description: String(formData.get("description") ?? "").trim() || undefined,
    subcategory: String(formData.get("subcategory") ?? "").trim() || undefined,
    brand: String(formData.get("brand") ?? "").trim() || undefined,
    estimatedDelivery: String(formData.get("estimatedDelivery") ?? "").trim() || undefined,
    pricingRuleType: String(formData.get("pricingRuleType") ?? "") || undefined,
    internalNotes: String(formData.get("internalNotes") ?? "").trim() || undefined,
    images: String(formData.get("images") ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    variants,
    manualPriceOverride: formData.get("manualPriceOverride") === "true",
    active: formData.get("active") === "true",
    featured: formData.get("featured") === "true",
  });
  if (!parsed.success) redirect(`/admin/produtos/${String(formData.get("id"))}?saved=error`);
  const {
    id,
    market,
    category: categoryName,
    brand: brandName,
    images,
    variants: offerVariants,
    estimatedDeliveryMinDays,
    estimatedDeliveryMaxDays,
    ...input
  } = parsed.data;
  const currency = MARKET_CONFIG[market].currency;
  const defaultVariant = offerVariants.find((variant) => variant.isDefault) ?? offerVariants[0];
  const [category, brand] = await Promise.all([
    db.category.upsert({ where: { slug: slugify(categoryName) }, update: { name: categoryName }, create: { name: categoryName, slug: slugify(categoryName) } }),
    brandName ? db.brand.upsert({ where: { slug: slugify(brandName) }, update: { name: brandName }, create: { name: brandName, slug: slugify(brandName) } }) : null,
  ]);
  const sellingPrice = input.manualPriceOverride
    ? defaultVariant.salePrice
    : defaultVariant.costPrice != null && input.pricingRuleType && input.pricingRuleValue != null
      ? calculateSellingPrice(defaultVariant.costPrice, { type: input.pricingRuleType, value: input.pricingRuleValue })
      : defaultVariant.salePrice;
  await db.$transaction(async (transaction) => {
    const product = await transaction.product.findUnique({ where: { id }, select: { id: true, slug: true, sku: true, supplierId: true, supplierProductId: true, supplier: { select: { id: true, name: true, supportedMarkets: true } } } });
    if (!product) throw new Error("Produto não encontrado.");
    if (!product.supplier.supportedMarkets.includes(market)) throw new Error(`Fornecedor ${product.supplier.name} não opera no mercado ${market}.`);
    const previous = await transaction.productMarketOffer.findFirst({ where: { productId: id, market }, select: { id: true, sellingPrice: true, slug: true } });
    await transaction.product.update({
      where: { id },
      data: {
        ...(market === "BR" ? input : { updatedAt: new Date() }),
        shortDescription: input.shortDescription ?? null,
        description: input.description ?? null,
        subcategory: input.subcategory ?? null,
        ...(market === "BR" ? {
          currency,
          costPrice: defaultVariant.costPrice,
          sellingPrice: sellingPrice ?? null,
          compareAtPrice: defaultVariant.compareAtPrice ?? null,
          discountPercent: calculateDiscount(sellingPrice, defaultVariant.compareAtPrice),
          shippingCost: input.shippingCost ?? null,
          estimatedDelivery: input.estimatedDelivery ?? null,
          pricingRuleType: input.pricingRuleType ?? null,
          pricingRuleValue: input.pricingRuleValue ?? null,
          stock: defaultVariant.stock,
          availability: defaultVariant.availability,
          manualPriceOverride: input.manualPriceOverride,
          active: input.active,
          featured: input.featured,
          popularityScore: input.popularityScore,
        } : {}),
        categoryId: category.id,
        brandId: brand?.id ?? null,
        ...(market === "BR" ? { images: { deleteMany: {}, create: images.map((url, position) => ({ url, sourceUrl: url, storageKey: url.startsWith("/") ? url : null, storageStatus: url.startsWith("/") ? "STORED" : "EXTERNAL", position, isPrimary: position === 0, alt: input.title })) } } : {}),
      },
    });
    const offerData = {
      supplierId: product.supplierId,
      supplierProductId: product.supplierProductId,
      sku: product.sku,
      title: market === "US" ? input.title : null,
      shortDescription: market === "US" ? input.shortDescription ?? null : null,
      description: market === "US" ? input.description ?? null : null,
      images: market === "US" ? images.map((url, position) => ({ url, alt: input.title, position, isPrimary: position === 0 })) as Prisma.InputJsonValue : undefined,
      slug: previous?.slug ?? (market === "BR" ? product.slug : `${product.slug}-us`),
      currency,
      costPrice: defaultVariant.costPrice,
      sellingPrice: sellingPrice ?? null,
      compareAtPrice: defaultVariant.compareAtPrice ?? null,
      discountPercent: calculateDiscount(sellingPrice, defaultVariant.compareAtPrice),
      stockQuantity: defaultVariant.stock,
      availability: defaultVariant.availability,
      shippingCost: input.shippingCost ?? null,
      estimatedDelivery: input.estimatedDelivery ?? null,
      estimatedDeliveryMinDays: estimatedDeliveryMinDays ?? null,
      estimatedDeliveryMaxDays: estimatedDeliveryMaxDays ?? null,
      sourceUrl: input.sourceUrl ?? null,
      active: input.active,
      featured: input.featured,
      popularityScore: input.popularityScore,
      manualPriceOverride: input.manualPriceOverride,
      pricingRuleType: input.pricingRuleType ?? null,
      pricingRuleValue: input.pricingRuleValue ?? null,
      internalNotes: input.internalNotes ?? null,
      syncStatus: "SYNCED" as const,
      lastSyncedAt: new Date(),
      lastPriceSyncAt: new Date(),
      lastStockSyncAt: new Date(),
    };
    const offer = previous
      ? await transaction.productMarketOffer.update({ where: { id: previous.id }, data: offerData })
      : await transaction.productMarketOffer.create({ data: { ...offerData, productId: id, market } });
    await transaction.productMarketOfferVariant.deleteMany({ where: { offerId: offer.id } });
    await transaction.productMarketOfferVariant.createMany({
      data: offerVariants.map((variant, position) => ({
        offerId: offer.id,
        label: variant.label,
        sku: variant.sku ?? null,
        attributes: variant.attributes as Prisma.InputJsonValue,
        costPrice: variant.costPrice,
        salePrice: variant.isDefault ? sellingPrice ?? variant.salePrice : variant.salePrice,
        compareAtPrice: variant.compareAtPrice ?? null,
        stock: variant.stock,
        active: variant.active,
        availability: variant.availability,
        sourceUrl: variant.sourceUrl ?? null,
        imageUrl: variant.imageUrl ?? null,
        isDefault: variant.isDefault,
        position,
      })),
    });
    if (sellingPrice != null && Number(previous?.sellingPrice) !== sellingPrice) {
      await transaction.priceHistory.create({ data: { productId: id, productOfferId: offer.id, market, sellingPrice, compareAtPrice: defaultVariant.compareAtPrice, costPrice: defaultVariant.costPrice, currency } });
    }
  });
  revalidatePath(`/admin/produtos/${id}`);
  revalidatePath("/", "layout");
  redirect(`/admin/produtos/${id}?saved=ok&market=${market}`);
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
  supportedMarkets: z.array(z.string().transform((value) => value.toUpperCase()).refine(isMarket)).min(1),
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
    supportedMarkets: formData.getAll("supportedMarkets"),
  });
  if (!parsed.success) redirect(`/admin/fornecedores?saved=error${id ? `&id=${id}` : ""}`);
  const { credentials: credentialValues, id: supplierId, settings: parsedSettings, ...data } = parsed.data;
  const supplierSettings = parsedSettings as Prisma.InputJsonValue;
  const credentialsEncrypted = Object.keys(credentialValues).length ? encryptSupplierCredentials(credentialValues) : undefined;
  if (supplierId) {
    await db.supplier.update({ where: { id: supplierId }, data: { ...data, supportedMarkets: data.supportedMarkets as Market[], settings: supplierSettings, ...(credentialsEncrypted ? { credentialsEncrypted } : {}) } });
    await db.product.updateMany({ where: { supplierId }, data: { supplierName: data.name } });
  } else {
    await db.supplier.create({ data: { ...data, supportedMarkets: data.supportedMarkets as Market[], settings: supplierSettings, slug: slugify(data.name), ...(credentialsEncrypted ? { credentialsEncrypted } : {}) } });
  }
  revalidatePath("/admin/fornecedores");
  revalidatePath("/admin/importar");
  redirect("/admin/fornecedores?saved=ok");
}

function parseVariants(formData: FormData) {
  try {
    const value = JSON.parse(String(formData.get("variantsJson") ?? "[]")) as unknown;
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
