export interface ProductGalleryImage {
  id: string;
  url: string;
  alt: string | null;
}

export function imagesWithFeaturedVariant(
  images: ProductGalleryImage[],
  name: string,
  featuredImageUrl?: string | null,
) {
  if (!featuredImageUrl) return images;
  const existingIndex = images.findIndex((image) => image.url === featuredImageUrl);
  if (existingIndex === 0) return images;
  const featured = existingIndex > 0
    ? images[existingIndex]
    : { id: `variant-image-${featuredImageUrl}`, url: featuredImageUrl, alt: name };
  return [featured, ...images.filter((_, index) => index !== existingIndex)];
}
