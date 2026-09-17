import { z } from "zod";

const finiteMoney = z.number().finite().nonnegative();
const httpOrLocalUrl = z.string().trim().min(1).refine((value) => {
  if (value.startsWith("/")) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Use uma URL HTTP/HTTPS ou um caminho local iniciado por /");
const imageUrl = httpOrLocalUrl.refine((value) => value.startsWith("/") || value.startsWith("https://"), "Imagens externas devem usar HTTPS");

export const normalizedVariantSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { hasColorMaterial?: unknown }).hasColorMaterial !== false) return value;
  return { ...value, colorMaterialName: undefined, materialType: undefined, colorHex: undefined, textureImageUrl: undefined };
}, z.object({
  supplierVariantId: z.string().trim().max(255).optional(),
  sku: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(300),
  options: z.record(z.string(), z.string().max(500)),
  costPrice: finiteMoney.optional(),
  sellingPrice: finiteMoney.optional(),
  compareAtPrice: finiteMoney.optional(),
  stock: z.number().int().nonnegative(),
  active: z.boolean().default(true),
  availability: z.enum(["AVAILABLE", "OUT_OF_STOCK", "PREORDER", "UNKNOWN", "REMOVED"]).optional(),
  sourceUrl: httpOrLocalUrl.optional(),
  imageUrl: imageUrl.optional(),
  hasColorMaterial: z.boolean().optional(),
  colorMaterialName: z.string().trim().min(1).max(160).optional(),
  materialType: z.string().trim().min(1).max(120).optional(),
  colorHex: z.string().trim().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toUpperCase()).optional(),
  textureImageUrl: imageUrl.optional(),
}).superRefine((variant, context) => {
  if (!variant.hasColorMaterial) return;
  if (!variant.colorMaterialName) {
    context.addIssue({ code: "custom", path: ["colorMaterialName"], message: "Informe o nome da cor/material." });
  }
  if (!variant.colorHex && !variant.textureImageUrl) {
    context.addIssue({ code: "custom", path: ["colorHex"], message: "Informe uma cor HEX ou imagem de textura." });
  }
}));

export const normalizedSupplierProductSchema = z.object({
  supplierProductId: z.string().trim().min(1).max(255),
  sku: z.string().trim().min(1).max(255),
  title: z.string().trim().min(2).max(300),
  slug: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(30_000).optional(),
  shortDescription: z.string().trim().max(800).optional(),
  category: z.string().trim().min(2).max(120),
  categorySlug: z.string().trim().min(2).max(140).optional(),
  subcategory: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  images: z.array(z.object({
    url: imageUrl,
    alt: z.string().trim().max(300).optional(),
    isPrimary: z.boolean().optional(),
  })).max(30),
  costPrice: finiteMoney.optional(),
  sellingPrice: finiteMoney.optional(),
  compareAtPrice: finiteMoney.optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("BRL"),
  stock: z.number().int().nonnegative().default(0),
  availability: z.enum(["AVAILABLE", "OUT_OF_STOCK", "PREORDER", "UNKNOWN", "REMOVED"]),
  shippingCost: finiteMoney.optional(),
  estimatedDelivery: z.string().trim().max(300).optional(),
  sourceUrl: httpOrLocalUrl.optional(),
  variants: z.array(normalizedVariantSchema).max(200).default([]),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  sourceUpdatedAt: z.date().optional(),
});

export type ValidatedSupplierProduct = z.infer<typeof normalizedSupplierProductSchema>;
