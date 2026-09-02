export interface SelectableProductVariant {
  id: string;
  label: string;
  attributes: Record<string, string | number | boolean>;
  stock: number;
  availability: string;
}

export interface ProductVariantGroup {
  key: string;
  label: string;
  values: string[];
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
  const groups = keys.flatMap<ProductVariantGroup>((key) => {
    if (variants.some((variant) => variant.attributes[key] == null || String(variant.attributes[key]).trim() === "")) return [];
    const values = Array.from(new Set(variants.map((variant) => String(variant.attributes[key]))));
    if (values.length < 2) return [];
    return [{ key, label: attributeLabel(key, market), values }];
  });

  const seenPartitions = new Map<string, ProductVariantGroup>();
  return groups.filter((group) => {
    const buckets = new Map<string, number[]>();
    variants.forEach((variant, index) => {
      const value = String(variant.attributes[group.key]);
      buckets.set(value, [...(buckets.get(value) ?? []), index]);
    });
    const partition = Array.from(buckets.values())
      .map((indices) => indices.join(","))
      .sort()
      .join("|");
    const previous = seenPartitions.get(partition);
    if (previous && valuesAreDerived(group, previous, variants)) return false;
    if (!previous) seenPartitions.set(partition, group);
    return true;
  });
}

export function variantIsSelectable(variant: SelectableProductVariant) {
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

function valuesAreDerived(
  candidate: ProductVariantGroup,
  previous: ProductVariantGroup,
  variants: SelectableProductVariant[],
) {
  return variants.every((variant) => {
    const candidateValue = normalizeComparable(String(variant.attributes[candidate.key]));
    const previousValue = normalizeComparable(String(variant.attributes[previous.key]));
    return candidateValue !== previousValue && previousValue.includes(candidateValue);
  });
}

function normalizeComparable(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "");
}
