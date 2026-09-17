export interface SelectableProductVariant {
  id: string;
  label: string;
  attributes: Record<string, string | number | boolean>;
  stock: number;
  availability: string;
  active?: boolean;
}

export interface ProductVariantGroup {
  key: string;
  label: string;
  options: ProductVariantOption[];
  values: string[];
}

export interface ProductVariantOption {
  value: string;
  label: string;
  variantIds: string[];
}

const ATTRIBUTE_LABELS: Record<string, { BR: string; US: string }> = {
  cor: { BR: "Cor", US: "Color" },
  color: { BR: "Cor", US: "Color" },
  tamanho: { BR: "Tamanho", US: "Size" },
  size: { BR: "Tamanho", US: "Size" },
  medida: { BR: "Medida", US: "Dimensions" },
  dimensoes: { BR: "Dimensões", US: "Dimensions" },
  dimensions: { BR: "Dimensões", US: "Dimensions" },
  material: { BR: "Material", US: "Material" },
  acabamento: { BR: "Acabamento", US: "Finish" },
  finish: { BR: "Acabamento", US: "Finish" },
};

export function deriveVariantGroups(variants: SelectableProductVariant[], market: "BR" | "US") {
  if (variants.length < 2) return [];
  const keys = Array.from(new Set(variants.flatMap((variant) => Object.keys(variant.attributes))));
  const groups = keys.flatMap<RawProductVariantGroup>((key) => {
    if (variants.some((variant) => variant.attributes[key] == null || String(variant.attributes[key]).trim() === "")) return [];
    const values = Array.from(new Set(variants.map((variant) => String(variant.attributes[key]))));
    if (values.length < 2) return [];
    return [{ key, label: attributeLabel(key, market), values, partition: partitionForKey(variants, key) }];
  });

  const groupsByPartition = new Map<string, RawProductVariantGroup[]>();
  for (const group of groups) {
    groupsByPartition.set(group.partition, [...(groupsByPartition.get(group.partition) ?? []), group]);
  }
  return Array.from(groupsByPartition.values())
    .map((equivalentGroups) => compactEquivalentGroups(equivalentGroups, variants));
}

export function variantIsSelectable(variant: SelectableProductVariant) {
  if (variant.active === false) return false;
  if (variant.availability === "PREORDER") return true;
  if (variant.availability === "OUT_OF_STOCK" || variant.availability === "REMOVED") return false;
  return variant.stock > 0;
}

export function findVariantForAttribute<T extends SelectableProductVariant>(
  variants: T[],
  groups: ProductVariantGroup[],
  selected: T | undefined,
  key: string,
  value: string,
) {
  const matches = variants.filter((variant) => {
    if (String(variant.attributes[key]) !== value) return false;
    return groups.every((group) => (
      group.key === key || !selected || String(variant.attributes[group.key]) === String(selected.attributes[group.key])
    ));
  });
  return matches.find(variantIsSelectable) ?? matches[0];
}

function attributeLabel(key: string, market: "BR" | "US") {
  const normalized = key.trim().toLocaleLowerCase("pt-BR").replace(/[_-]+/g, " ");
  const known = ATTRIBUTE_LABELS[normalized];
  if (known) return known[market];
  return normalized.charAt(0).toLocaleUpperCase(market === "US" ? "en-US" : "pt-BR") + normalized.slice(1);
}

interface RawProductVariantGroup {
  key: string;
  label: string;
  values: string[];
  partition: string;
}

function compactEquivalentGroups(
  groups: RawProductVariantGroup[],
  variants: SelectableProductVariant[],
): ProductVariantGroup {
  const primary = [...groups].sort((left, right) => groupRank(left.key) - groupRank(right.key))[0];
  return {
    key: primary.key,
    label: primary.label,
    values: primary.values,
    options: primary.values.map((value) => {
      const matchingVariants = variants.filter((variant) => String(variant.attributes[primary.key]) === value);
      const firstVariant = matchingVariants[0];
      return {
        value,
        label: firstVariant ? optionLabel(firstVariant, primary.key, groups) : value,
        variantIds: matchingVariants.map((variant) => variant.id),
      };
    }),
  };
}

function partitionForKey(variants: SelectableProductVariant[], key: string) {
  const buckets = new Map<string, number[]>();
  variants.forEach((variant, index) => {
    const value = String(variant.attributes[key]);
    buckets.set(value, [...(buckets.get(value) ?? []), index]);
  });
  return Array.from(buckets.values())
    .map((indices) => indices.join(","))
    .sort()
    .join("|");
}

function groupRank(key: string) {
  const normalized = normalizeKey(key);
  if (["tamanho", "size", "medida", "option", "opcao", "opção"].includes(normalized)) return 0;
  if (["nome", "name", "modelo", "model", "tipo", "type"].includes(normalized)) return 1;
  if (["dimensoes", "dimensions", "dimensao", "dimension"].includes(normalized)) return 2;
  if (["quantidade", "quantity", "qtd", "qty"].includes(normalized)) return 3;
  return 10;
}

function optionLabel(
  variant: SelectableProductVariant,
  primaryKey: string,
  groups: RawProductVariantGroup[],
) {
  const primaryValue = cleanOptionText(String(variant.attributes[primaryKey]));
  const dimension = groups
    .map((group) => String(variant.attributes[group.key]))
    .map(extractDimensionLabel)
    .find((value) => value && !normalizeComparable(primaryValue).includes(normalizeComparable(value)));
  if (dimension && !hasDimension(primaryValue)) return `${primaryValue} ${dimension}`;
  return primaryValue;
}

function normalizeComparable(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "");
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[_-]+/g, " ");
}

function cleanOptionText(value: string) {
  return value
    .replace(/\b(size|tamanho)\b\s*$/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/x/gi, "×")
    .trim();
}

function extractDimensionLabel(value: string) {
  const dimension = value.match(/\d+(?:[,.]\d+)?(?:\s*[x×]\s*\d+(?:[,.]\d+)?){1,3}/i)?.[0];
  if (!dimension) return null;
  const parts = dimension.split(/[x×]/i).map((part) => part.trim()).filter(Boolean);
  return parts.slice(0, 2).join("×");
}

function hasDimension(value: string) {
  return /\d+(?:[,.]\d+)?\s*[x×]\s*\d+(?:[,.]\d+)?/i.test(value);
}
