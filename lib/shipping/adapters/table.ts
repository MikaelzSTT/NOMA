import { resolveBrazilianStateFromPostalCode, type BrazilianStateCode } from "@/lib/shipping/br-postal-code";
import { ShippingQuoteError, type ShippingAdapter } from "@/lib/shipping/types";

type BrRegionTableConfig = {
  serviceCode: string;
  serviceName: string;
  ratesByUf: Record<BrazilianStateCode, number>;
};

const DEFAULT_BR_RATES_BY_UF: Record<BrazilianStateCode, number> = {
  SP: 169,
  PR: 220,
  SC: 220,
  RS: 220,
  MG: 220,
  RJ: 220,
  ES: 220,
  GO: 550,
  MT: 550,
  MS: 550,
  DF: 550,
  BA: 550,
  SE: 550,
  AL: 550,
  PE: 550,
  PB: 550,
  RN: 550,
  CE: 550,
  PI: 550,
  MA: 550,
  AC: 850,
  AP: 850,
  AM: 850,
  PA: 850,
  RO: 850,
  RR: 850,
  TO: 850,
};

export const DEFAULT_BR_REGION_TABLE_CONFIG: BrRegionTableConfig = {
  serviceCode: "br-region-table",
  serviceName: "Entrega",
  ratesByUf: DEFAULT_BR_RATES_BY_UF,
};

export const tableShippingAdapter: ShippingAdapter = {
  async quote(input) {
    if (input.market !== "BR") return [];

    const table = readBrRegionTableConfig(input.supplier.shippingConfig);
    const destinationState = resolveBrazilianStateFromPostalCode(input.destinationPostalCode);
    const price = roundMoney(table.ratesByUf[destinationState]);

    if (!Number.isFinite(price) || price < 0) {
      throw new ShippingQuoteError("shipping_table_missing_rate", 422, "Nao foi possivel calcular o frete para este CEP.");
    }

    return [{
      serviceCode: table.serviceCode,
      serviceName: table.serviceName,
      price,
      currency: input.offer.currency,
      estimatedMinDays: null,
      estimatedMaxDays: null,
      rawResponse: {
        source: input.supplier.shippingConfig && hasBrRegionTable(input.supplier.shippingConfig)
          ? "Supplier.shippingConfig.brRegionTable"
          : "DEFAULT_BR_REGION_TABLE_CONFIG",
        destinationState,
      },
    }];
  },
};

function readBrRegionTableConfig(value: unknown): BrRegionTableConfig {
  if (!hasBrRegionTable(value)) return DEFAULT_BR_REGION_TABLE_CONFIG;

  const serviceCode = stringField(value.brRegionTable.serviceCode, DEFAULT_BR_REGION_TABLE_CONFIG.serviceCode);
  const serviceName = stringField(value.brRegionTable.serviceName, DEFAULT_BR_REGION_TABLE_CONFIG.serviceName);
  const configuredRates = value.brRegionTable.ratesByUf;
  return {
    serviceCode,
    serviceName,
    ratesByUf: {
      ...DEFAULT_BR_REGION_TABLE_CONFIG.ratesByUf,
      ...Object.fromEntries(Object.entries(configuredRates).flatMap(([state, price]) => {
        if (!isBrazilianStateCode(state)) return [];
        const value = roundMoney(Number(price));
        return Number.isFinite(value) && value >= 0 ? [[state, value]] : [];
      })),
    },
  };
}

function hasBrRegionTable(value: unknown): value is { brRegionTable: { serviceCode?: unknown; serviceName?: unknown; ratesByUf: Record<string, unknown> } } {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && "brRegionTable" in value
    && value.brRegionTable
    && typeof value.brRegionTable === "object"
    && !Array.isArray(value.brRegionTable)
    && "ratesByUf" in value.brRegionTable
    && value.brRegionTable.ratesByUf
    && typeof value.brRegionTable.ratesByUf === "object"
    && !Array.isArray(value.brRegionTable.ratesByUf),
  );
}

function isBrazilianStateCode(value: string): value is BrazilianStateCode {
  return value in DEFAULT_BR_RATES_BY_UF;
}

function stringField(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
