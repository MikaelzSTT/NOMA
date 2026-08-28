export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function calculateDiscount(
  sellingPrice?: number | null,
  compareAtPrice?: number | null,
) {
  if (
    sellingPrice == null ||
    compareAtPrice == null ||
    sellingPrice < 0 ||
    compareAtPrice <= sellingPrice
  ) {
    return undefined;
  }

  return Math.round(((compareAtPrice - sellingPrice) / compareAtPrice) * 10_000) / 100;
}

export function formatMoney(value: number | string | { toString(): string }, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(value));
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function absoluteUrl(path = "") {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}

export function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter(Boolean) as T[];
}
