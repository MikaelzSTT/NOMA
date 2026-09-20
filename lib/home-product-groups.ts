export interface HomeProductCandidate {
  id: string;
  productId: string;
  title: string;
  category: { slug: string };
}

export function isHomeSofa(product: Pick<HomeProductCandidate, "title">) {
  return product.title.normalize("NFC").toLocaleLowerCase("pt-BR").includes("sofá");
}

export function groupHomeProducts<T extends HomeProductCandidate>(products: readonly T[]) {
  const sofas: T[] = [];
  const mattresses: T[] = [];
  const seenProductIds = new Set<string>();

  for (const product of products) {
    if (seenProductIds.has(product.productId)) continue;

    if (isHomeSofa(product)) {
      sofas.push(product);
      seenProductIds.add(product.productId);
      continue;
    }

    if (product.category.slug === "colchoes") {
      mattresses.push(product);
      seenProductIds.add(product.productId);
    }
  }

  return { sofas, mattresses };
}
