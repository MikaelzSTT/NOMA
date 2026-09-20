import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    productMarketOffer: { findFirst: vi.fn() },
    assistedPurchaseRequest: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { createAssistedPurchaseRequest } from "@/lib/assisted-purchase";
import {
  ASSISTED_PURCHASE_MINIMUM_BRL,
  requiresAssistedPurchase,
} from "@/lib/assisted-purchase-policy";
import { POST } from "@/app/api/assisted-purchase/route";

describe("regra de compra assistida", () => {
  it("mantém R$ 9.999,99 no fluxo normal", () => {
    expect(requiresAssistedPurchase("BR", 9_999.99)).toBe(false);
  });

  it("ativa o fluxo assistido em R$ 10.000,00", () => {
    expect(requiresAssistedPurchase("BR", ASSISTED_PURCHASE_MINIMUM_BRL)).toBe(true);
  });

  it("ativa o fluxo assistido acima de R$ 10.000,00", () => {
    expect(requiresAssistedPurchase("BR", 18_500)).toBe(true);
  });
});

describe("registro de compra assistida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture());
    mocks.db.assistedPurchaseRequest.create.mockResolvedValue({ id: "request-1" });
  });

  it("rejeita oferta abaixo do limite", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({
      variants: [variantFixture({ salePrice: 9_999.99 })],
    }));

    await expect(createAssistedPurchaseRequest(validInput(), "submission-key-0001"))
      .rejects.toMatchObject({
        code: "below_assisted_purchase_threshold",
        status: 409,
      });
    expect(mocks.db.assistedPurchaseRequest.create).not.toHaveBeenCalled();
  });

  it("o endpoint público rejeita oferta abaixo do limite", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({
      variants: [variantFixture({ salePrice: 9_999.99 })],
    }));
    const request = new NextRequest(new Request("https://noma.test/api/assisted-purchase", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "submission-key-http-0001",
        "x-forwarded-for": "203.0.113.11",
      },
      body: JSON.stringify(validInput()),
    }));

    const response = await POST(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      type: "error",
      error: "below_assisted_purchase_threshold",
    });
    expect(mocks.db.assistedPurchaseRequest.create).not.toHaveBeenCalled();
  });

  it("ignora preço manipulado e salva variante e snapshots vindos do banco", async () => {
    const manipulatedInput = { ...validInput(), displayedPrice: 1, price: 1 };

    await createAssistedPurchaseRequest(manipulatedInput, "submission-key-0002");

    expect(mocks.db.assistedPurchaseRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "product-1",
        offerId: "offer-1",
        variantId: "variant-1",
        market: "BR",
        productTitleSnapshot: "Sofá Horizonte",
        variantLabelSnapshot: "Linho natural / 240 cm",
        priceSnapshot: 12_500,
        currencySnapshot: "BRL",
        pageUrl: expect.stringContaining("/br/produto/sofa-horizonte"),
        customerName: "Maria Silva",
        phone: "+55 (11) 99999-9999",
        email: "maria@example.com",
        consent: true,
        status: "NEW",
      }),
    });
  });

  it("salva a variante atualmente selecionada", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({
      variants: [
        variantFixture({ id: "variant-1", label: "240 cm", salePrice: 12_500 }),
        variantFixture({ id: "variant-2", label: "300 cm", salePrice: 15_900 }),
      ],
    }));

    await createAssistedPurchaseRequest(validInput({ variantId: "variant-2" }), "submission-key-0003");

    expect(mocks.db.assistedPurchaseRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        variantId: "variant-2",
        variantLabelSnapshot: "300 cm",
        priceSnapshot: 15_900,
      }),
    });
  });

  it.each([
    ["nome obrigatório", { customerName: "" }],
    ["telefone obrigatório", { phone: "" }],
    ["telefone inválido", { phone: "123" }],
    ["e-mail inválido", { email: "email-invalido" }],
    ["consentimento obrigatório", { consent: false }],
  ])("valida %s", async (_label, override) => {
    await expect(createAssistedPurchaseRequest(
      validInput(override),
      "submission-key-0004",
    )).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    expect(mocks.db.productMarketOffer.findFirst).not.toHaveBeenCalled();
    expect(mocks.db.assistedPurchaseRequest.create).not.toHaveBeenCalled();
  });

  it("trata repetição da mesma chave como sucesso sem duplicar dados", async () => {
    mocks.db.assistedPurchaseRequest.create.mockRejectedValue({ code: "P2002" });

    await expect(createAssistedPurchaseRequest(validInput(), "submission-key-0005"))
      .resolves.toEqual({ type: "success" });
  });
});

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    productId: "product-1",
    offerId: "offer-1",
    variantId: "variant-1",
    customerName: "Maria Silva",
    phone: "+55 (11) 99999-9999",
    email: "maria@example.com",
    consent: true,
    ...overrides,
  };
}

function offerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "offer-1",
    productId: "product-1",
    market: "BR",
    currency: "BRL",
    title: "Sofá Horizonte",
    slug: "sofa-horizonte",
    sellingPrice: 12_500,
    availability: "AVAILABLE",
    active: true,
    product: {
      id: "product-1",
      title: "Sofá original",
      active: true,
      archivedAt: null,
    },
    variants: [variantFixture()],
    ...overrides,
  };
}

function variantFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "variant-1",
    offerId: "offer-1",
    label: "Linho natural / 240 cm",
    salePrice: 12_500,
    active: true,
    availability: "AVAILABLE",
    ...overrides,
  };
}
