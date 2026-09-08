import { ShippingQuoteError } from "@/lib/shipping/types";

export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type BrazilianStateCode = typeof BRAZILIAN_STATES[number];

const CEP_STATE_RANGES: Array<{ state: BrazilianStateCode; min: number; max: number }> = [
  { state: "SP", min: 1000, max: 19999 },
  { state: "RJ", min: 20000, max: 28999 },
  { state: "ES", min: 29000, max: 29999 },
  { state: "MG", min: 30000, max: 39999 },
  { state: "BA", min: 40000, max: 48999 },
  { state: "SE", min: 49000, max: 49999 },
  { state: "PE", min: 50000, max: 56999 },
  { state: "AL", min: 57000, max: 57999 },
  { state: "PB", min: 58000, max: 58999 },
  { state: "RN", min: 59000, max: 59999 },
  { state: "CE", min: 60000, max: 63999 },
  { state: "PI", min: 64000, max: 64999 },
  { state: "MA", min: 65000, max: 65999 },
  { state: "PA", min: 66000, max: 68899 },
  { state: "AP", min: 68900, max: 68999 },
  { state: "AM", min: 69000, max: 69299 },
  { state: "RR", min: 69300, max: 69399 },
  { state: "AM", min: 69400, max: 69899 },
  { state: "AC", min: 69900, max: 69999 },
  { state: "DF", min: 70000, max: 72799 },
  { state: "GO", min: 72800, max: 72999 },
  { state: "DF", min: 73000, max: 73699 },
  { state: "GO", min: 73700, max: 76799 },
  { state: "TO", min: 77000, max: 77999 },
  { state: "MT", min: 78000, max: 78899 },
  { state: "RO", min: 78900, max: 78999 },
  { state: "MS", min: 79000, max: 79999 },
  { state: "PR", min: 80000, max: 87999 },
  { state: "SC", min: 88000, max: 89999 },
  { state: "RS", min: 90000, max: 99999 },
];

export function normalizeBrazilianPostalCode(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits) || /^(\d)\1{7}$/.test(digits)) {
    throw new ShippingQuoteError("invalid_postal_code", 400, "CEP invalido.");
  }
  return digits;
}

export function resolveBrazilianStateFromPostalCode(value: string): BrazilianStateCode {
  const postalCode = normalizeBrazilianPostalCode(value);
  const prefix = Number(postalCode.slice(0, 5));
  const range = CEP_STATE_RANGES.find((item) => prefix >= item.min && prefix <= item.max);
  if (!range) {
    throw new ShippingQuoteError("postal_code_state_unresolved", 422, "Nao foi possivel identificar o estado pelo CEP.");
  }
  return range.state;
}

