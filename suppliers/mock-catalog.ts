import type { NormalizedSupplierProduct } from "@/lib/catalog/supplier-types";

export const MOCK_CATALOG: NormalizedSupplierProduct[] = [
  mockProduct("noma-sofa-arco", "SOF-ARCO-001", "Sofá Arco", 4966.67, 8940, 8, "Novo", 0, 0, ["Linho areia", "Bouclé natural"]),
  mockProduct("noma-poltrona-lina", "POL-LINA-001", "Poltrona Lina", 2377.78, 4280, 5, "Essencial", 1, 0, ["Linho cru", "Couro caramelo"]),
  mockProduct("noma-mesa-una", "MES-UNA-001", "Mesa Una", 3755.56, 6760, 3, "Edição 02", 2, 0, ["Nogueira", "Carvalho"]),
  mockProduct("noma-cama-bruma", "CAM-BRUMA-001", "Cama Bruma", 4105.56, 7390, 4, "Novo", 0, 1, ["Casal", "Queen", "King"]),
  mockProduct("noma-rack-vertice", "RAC-VERT-001", "Rack Vértice", 2844.44, 5120, 7, "Nogueira", 1, 1, ["1,80 m", "2,20 m"]),
  mockProduct("noma-mesa-lume", "MES-LUME-001", "Mesa Lume", 1366.67, 2460, 9, "Travertino", 2, 1, ["Travertino", "Nero Marquina"]),
];

function mockProduct(
  supplierProductId: string,
  sku: string,
  title: string,
  costPrice: number,
  sellingPrice: number,
  stock: number,
  badge: string,
  spriteColumn: number,
  spriteRow: number,
  options: string[],
): NormalizedSupplierProduct {
  return {
    supplierProductId,
    sku,
    title,
    slug: supplierProductId.replace("noma-", ""),
    shortDescription: `${title} com desenho autoral, materiais naturais e acabamento preciso.`,
    description: `${title} integra a coleção demonstrativa Noma. O registro usa o mesmo modelo definitivo do catálogo e pode ser substituído por dados autorizados de fornecedores.`,
    category: "Móveis",
    categorySlug: "moveis",
    brand: "Noma",
    images: [{ url: "/images/noma/products.webp", alt: title, isPrimary: true }],
    costPrice,
    sellingPrice,
    currency: "BRL",
    stock,
    availability: stock > 0 ? "AVAILABLE" : "OUT_OF_STOCK",
    estimatedDelivery: "7 a 15 dias úteis",
    sourceUrl: `https://example.com/noma-demo/${supplierProductId}`,
    variants: options.map((option, index) => ({
      supplierVariantId: `${supplierProductId}-${index + 1}`,
      sku: `${sku}-${index + 1}`,
      title: option,
      options: { Opção: option },
      costPrice,
      sellingPrice,
      stock: Math.max(0, stock - index),
      active: true,
    })),
    attributes: { badge, spriteColumn, spriteRow, material: options[0] ?? "Natural" },
    active: true,
    featured: true,
  };
}
