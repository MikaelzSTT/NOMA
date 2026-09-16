export const PRODUCT_CATEGORY_SLUGS = ["moveis", "colchoes"] as const;

export const PRODUCT_CATEGORIES = [
  { slug: "moveis", label: "Móveis" },
  { slug: "colchoes", label: "Colchões" },
] as const;

export type ProductCategorySlug = typeof PRODUCT_CATEGORIES[number]["slug"];

const FURNITURE_TITLE_TERMS = ["sofa", "cama", "mesa", "poltrona", "rack"];

export function getProductCategory(slug: ProductCategorySlug) {
  return PRODUCT_CATEGORIES.find((category) => category.slug === slug)!;
}

export function isProductCategorySlug(value: string): value is ProductCategorySlug {
  return PRODUCT_CATEGORY_SLUGS.includes(value as ProductCategorySlug);
}

export function classifyProductTitle(title: string): ProductCategorySlug | null {
  const normalized = normalizeCategoryText(title);
  const isMattress = normalized.includes("colchao");
  const isSofa = normalized.includes("sofa");
  if (isMattress && isSofa) return null;
  if (isMattress) return "colchoes";
  return FURNITURE_TITLE_TERMS.some((term) => normalized.includes(term)) ? "moveis" : null;
}

export function resolveProductCategory(input: {
  title: string;
  category?: string | null;
  categorySlug?: string | null;
}): ProductCategorySlug | null {
  for (const value of [input.categorySlug, input.category]) {
    if (!value) continue;
    const normalized = normalizeCategoryText(value);
    const exact = PRODUCT_CATEGORIES.find((category) => (
      normalizeCategoryText(category.slug) === normalized
      || normalizeCategoryText(category.label) === normalized
    ));
    if (exact) return exact.slug;
  }

  return classifyProductTitle(input.title)
    ?? classifyProductTitle(input.category ?? "");
}

function normalizeCategoryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
