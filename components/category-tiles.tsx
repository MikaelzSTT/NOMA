import Link from "next/link";
import { Baby, Dumbbell, Headphones, House, LampFloor, Shirt, Sparkles } from "lucide-react";

const iconBySlug = {
  eletronicos: Headphones,
  "casa-e-cozinha": House,
  "moveis-e-decoracao": LampFloor,
  moda: Shirt,
  esportes: Dumbbell,
  beleza: Sparkles,
  "bebes-e-brinquedos": Baby,
};

export function CategoryTiles({ categories }: { categories: Array<{ id: string; name: string; slug: string; _count: { products: number } }> }) {
  return (
    <section className="page-section -mt-8 relative z-10" aria-labelledby="categorias-title">
      <div className="section-heading mb-4">
        <div><p className="eyebrow">Explore</p><h2 id="categorias-title">Categorias</h2></div>
      </div>
      <div className="category-grid">
        {categories.map((category) => {
          const Icon = iconBySlug[category.slug as keyof typeof iconBySlug] ?? Sparkles;
          return (
            <Link key={category.id} href={`/categoria/${category.slug}`} className="category-tile">
              <span className="grid size-10 place-items-center rounded-md bg-mint text-brand"><Icon size={21} /></span>
              <span className="min-w-0">
                <strong className="block text-sm text-ink">{category.name}</strong>
                <small className="text-xs text-muted">{category._count.products} itens</small>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
