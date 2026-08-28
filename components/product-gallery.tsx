"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "lucide-react";

export function ProductGallery({ images, name, sprite }: { images: Array<{ id: string; url: string; alt: string | null }>; name: string; sprite?: { column: number; row: number } }) {
  const [selected, setSelected] = useState(0);
  const current = images[selected];

  return (
    <div className="product-gallery">
      <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-white">
        {current?.url === "/images/noma/products.webp" && sprite ? (
          <div role="img" aria-label={current.alt ?? name} className="h-full w-full bg-[length:300%_200%] bg-no-repeat" style={{ backgroundImage: `url(${current.url})`, backgroundPosition: `${sprite.column * 50}% ${sprite.row * 100}%` }} />
        ) : current ? (
          <Image src={current.url} alt={current.alt ?? name} fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-contain p-4 sm:p-8" />
        ) : (
          <div className="grid h-full place-items-center text-border-strong"><ImageIcon size={52} /></div>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button key={image.id} onClick={() => setSelected(index)} className="relative size-16 shrink-0 overflow-hidden rounded-sm border bg-white data-[active=true]:border-brand" data-active={selected === index} aria-label={`Ver imagem ${index + 1}`}>
              <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
