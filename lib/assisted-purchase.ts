import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";
import { requiresAssistedPurchase } from "@/lib/assisted-purchase-policy";
import { productPath } from "@/lib/market";
import { absoluteUrl } from "@/lib/utils";

const phoneSchema = z.string().trim().min(1).max(40).superRefine((value, context) => {
  if (!/^[+()\-\s.\d]+$/.test(value)) {
    context.addIssue({ code: "custom", message: "Telefone inválido." });
    return;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    context.addIssue({ code: "custom", message: "Telefone inválido." });
  }
});

const optionalEmailSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.email().max(255).optional(),
);

export const assistedPurchaseRequestSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  offerId: z.string().trim().min(1).max(120),
  variantId: z.string().trim().min(1).max(120).nullable().optional(),
  customerName: z.string().trim().min(1).max(255),
  phone: phoneSchema,
  email: optionalEmailSchema,
  consent: z.literal(true),
});

const submissionKeySchema = z.string().trim().min(12).max(120);

export type AssistedPurchaseRequestInput = z.infer<typeof assistedPurchaseRequestSchema>;

export class AssistedPurchaseError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(code);
    this.name = "AssistedPurchaseError";
  }
}

export async function createAssistedPurchaseRequest(
  rawInput: unknown,
  rawSubmissionKey: unknown,
) {
  const parsed = assistedPurchaseRequestSchema.safeParse(rawInput);
  const parsedSubmissionKey = submissionKeySchema.safeParse(rawSubmissionKey);
  if (!parsed.success || !parsedSubmissionKey.success) {
    throw new AssistedPurchaseError("invalid_request", 400, "Revise os dados informados.");
  }

  const input = parsed.data;
  const offer = await db.productMarketOffer.findFirst({
    where: { id: input.offerId, productId: input.productId },
    select: {
      id: true,
      productId: true,
      market: true,
      currency: true,
      title: true,
      slug: true,
      sellingPrice: true,
      availability: true,
      active: true,
      product: {
        select: { id: true, title: true, active: true, archivedAt: true },
      },
      variants: {
        select: {
          id: true,
          offerId: true,
          label: true,
          salePrice: true,
          active: true,
          availability: true,
        },
      },
    },
  });

  if (!offer || !offer.active || !offer.product.active || offer.product.archivedAt) {
    throw new AssistedPurchaseError("product_unavailable", 404, "Produto indisponível.");
  }
  if (offer.market !== "BR" || offer.currency !== "BRL") {
    throw new AssistedPurchaseError("market_not_supported", 409, "Atendimento de compra indisponível para esta oferta.");
  }
  if (!isAvailable(offer.availability)) {
    throw new AssistedPurchaseError("product_unavailable", 409, "Produto indisponível.");
  }

  const activeVariants = offer.variants.filter((variant) => variant.active);
  let variant: (typeof offer.variants)[number] | null = null;
  if (activeVariants.length > 0) {
    variant = activeVariants.find((item) => item.id === input.variantId) ?? null;
    if (!variant || variant.offerId !== offer.id || !isAvailable(variant.availability)) {
      throw new AssistedPurchaseError("variant_unavailable", 400, "Selecione uma variante disponível.");
    }
  } else if (input.variantId) {
    throw new AssistedPurchaseError("variant_unavailable", 400, "Selecione uma variante disponível.");
  }

  const currentPrice = roundMoney(Number(variant?.salePrice ?? offer.sellingPrice));
  if (currentPrice <= 0) {
    throw new AssistedPurchaseError("invalid_price", 409, "Preço indisponível.");
  }
  if (!requiresAssistedPurchase(offer.market, currentPrice)) {
    throw new AssistedPurchaseError(
      "below_assisted_purchase_threshold",
      409,
      "Este produto está disponível no checkout normal.",
    );
  }

  let request: { id: string } | null = null;
  try {
    request = await db.assistedPurchaseRequest.create({
      data: {
        productId: offer.productId,
        offerId: offer.id,
        variantId: variant?.id ?? null,
        market: offer.market,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email ?? null,
        consent: true,
        productTitleSnapshot: snapshotText(offer.title ?? offer.product.title),
        variantLabelSnapshot: variant ? snapshotText(variant.label) : null,
        priceSnapshot: currentPrice,
        currencySnapshot: offer.currency,
        pageUrl: absoluteUrl(productPath(offer.market, offer.slug)).slice(0, 1000),
        status: "NEW",
        submissionKey: parsedSubmissionKey.data,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    request = await db.assistedPurchaseRequest.findUnique({
      where: { submissionKey: parsedSubmissionKey.data },
      select: { id: true },
    });
    if (!request) throw error;
  }

  return { type: "success" as const, conversionId: request.id };
}

function isAvailable(value: string) {
  return value === "AVAILABLE" || value === "PREORDER";
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function snapshotText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
