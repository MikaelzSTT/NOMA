const INTERNAL_ATTRIBUTE_TOKENS = new Set([
  "active",
  "adapter",
  "admin",
  "api",
  "archived",
  "atacado",
  "badge",
  "config",
  "configuration",
  "cost",
  "custo",
  "created",
  "credential",
  "debug",
  "deleted",
  "endpoint",
  "enabled",
  "error",
  "erp",
  "external",
  "flag",
  "freight",
  "frete",
  "fornecedor",
  "id",
  "integration",
  "integracao",
  "internal",
  "interno",
  "inventory",
  "key",
  "log",
  "loja",
  "manual",
  "marketplace",
  "metadata",
  "payload",
  "price",
  "preco",
  "provider",
  "raw",
  "reference",
  "secret",
  "seller",
  "setting",
  "settings",
  "shipping",
  "sku",
  "source",
  "sprite",
  "stock",
  "store",
  "strategy",
  "supplier",
  "sync",
  "technical",
  "tecnico",
  "token",
  "updated",
  "url",
  "uuid",
  "vendor",
  "version",
  "webhook",
  "wholesale",
]);

export type PublicProductAttributeValue = string | number;

export function publicProductAttributes(value: unknown): Record<string, PublicProductAttributeValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const attributes: Array<[string, PublicProductAttributeValue]> = [];
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || isInternalAttributeKey(key)) continue;

    if (typeof rawValue === "number") {
      if (Number.isFinite(rawValue)) attributes.push([key, rawValue]);
      continue;
    }

    if (typeof rawValue !== "string") continue;
    const publicValue = rawValue.trim();
    if (!publicValue || /^(?:true|false|null|undefined)$/i.test(publicValue)) continue;
    attributes.push([key, publicValue]);
  }

  return Object.fromEntries(attributes);
}

export function publicProductSpecifications(value: unknown) {
  return Object.entries(publicProductAttributes(value));
}

function isInternalAttributeKey(key: string) {
  const tokens = key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return tokens.some((token) => INTERNAL_ATTRIBUTE_TOKENS.has(token));
}
