"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import { imagesWithFeaturedVariant } from "@/lib/product-gallery-images";
import styles from "./product-detail.module.css";

export function ProductGallery({ images, name, sprite, featuredImageUrl }: { images: Array<{ id: string; url: string; alt: string | null }>; name: string; sprite?: { column: number; row: number }; featuredImageUrl?: string | null }) {
  const [selected, setSelected] = useState(0);
  const visibleImages = useMemo(() => imagesWithFeaturedVariant(images, name, featuredImageUrl), [featuredImageUrl, images, name]);
  const current = visibleImages[selected];

  return (
    <div className={styles.gallery}>
      <div className={styles.galleryMain}>
        {current?.url === "/images/noma/products.webp" && sprite ? (
          <div role="img" aria-label={current.alt ?? name} className={styles.spriteImage} style={{ backgroundImage: `url(${current.url})`, backgroundPosition: `${sprite.column * 50}% ${sprite.row * 100}%` }} />
        ) : current ? (
          <Image src={current.url} alt={current.alt ?? name} fill preload sizes="(max-width: 820px) 100vw, 58vw" />
        ) : (
          <div className={styles.galleryEmpty}><ImageIcon size={52} /></div>
        )}
      </div>
      {visibleImages.length > 1 && (
        <div className={styles.thumbnails}>
          {visibleImages.map((image, index) => (
            <button key={image.id} type="button" onClick={() => setSelected(index)} className={styles.thumbnail} data-active={selected === index} aria-label={`Ver imagem ${index + 1}`}>
              <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
