import type { CatalogProduct } from "@/lib/catalog";
import { NomaProductCard } from "@/components/home/noma-product-card";
import homeStyles from "@/components/home/noma-home.module.css";
import styles from "./editorial-product-listing.module.css";

export function EditorialProductListing({
  eyebrow,
  title,
  description,
  products,
  emptyMessage,
  pageName,
}: {
  eyebrow: string;
  title: string;
  description: string;
  products: CatalogProduct[];
  emptyMessage: string;
  pageName: string;
}) {
  return (
    <div className={styles.page} data-noma-listing={pageName}>
      <header className={styles.hero}>
        <div className={styles.shell}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <div className={styles.heroContent}>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
      </header>

      <section className={styles.products} aria-label={`Produtos de ${title}`}>
        <div className={styles.shell}>
          {products.length > 0 ? (
            <div className={`${homeStyles.storeProductGrid} ${homeStyles.featuredProductGrid} ${styles.grid}`}>
              {products.map((product, index) => (
                <NomaProductCard
                  key={product.id}
                  product={product}
                  market="BR"
                  index={index}
                  variant="featured"
                />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>{emptyMessage}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
