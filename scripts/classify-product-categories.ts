import "dotenv/config";
import { db } from "@/lib/db";
import { classifyProductTitle, getProductCategory, PRODUCT_CATEGORY_SLUGS } from "@/lib/product-categories";

async function main() {
  const products = await db.product.findMany({
    select: {
      id: true,
      title: true,
      category: { select: { name: true, slug: true } },
    },
    orderBy: { title: "asc" },
  });
  const classified = {
    moveis: products.filter((product) => classifyProductTitle(product.title) === "moveis"),
    colchoes: products.filter((product) => classifyProductTitle(product.title) === "colchoes"),
  };
  const unclassified = products.filter((product) => classifyProductTitle(product.title) === null);

  console.info(`Móveis: ${classified.moveis.length}`);
  console.info(`Colchões: ${classified.colchoes.length}`);
  console.info(`Não classificados: ${unclassified.length}`);
  for (const product of unclassified) {
    console.info(`- ${product.title} (categoria atual: ${product.category.name} / ${product.category.slug})`);
  }

  if (!process.argv.includes("--apply")) {
    console.info("Prévia concluída. Execute novamente com --apply para atualizar.");
    return;
  }
  if (unclassified.length > 0) {
    throw new Error("Atualização cancelada: existem produtos não classificados pelas regras de título.");
  }

  await db.$transaction(async (transaction) => {
    const categories = await Promise.all(PRODUCT_CATEGORY_SLUGS.map((slug) => {
      const category = getProductCategory(slug);
      return transaction.category.upsert({
        where: { slug },
        update: { name: category.label },
        create: { name: category.label, slug },
      });
    }));
    const categoryIdBySlug = Object.fromEntries(categories.map((category) => [category.slug, category.id]));
    await Promise.all(PRODUCT_CATEGORY_SLUGS.map((slug) => transaction.product.updateMany({
      where: { id: { in: classified[slug].map((product) => product.id) } },
      data: { categoryId: categoryIdBySlug[slug] },
    })));
  });

  console.info(`Atualização aplicada a ${products.length} produto(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao classificar categorias.");
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
