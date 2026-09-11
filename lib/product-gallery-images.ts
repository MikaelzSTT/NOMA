export interface ProductGalleryImage {
  id: string;
  url: string;
  alt: string | null;
}

export function imageDedupeKey(url: string) {
  const value = url.trim();
  if (!value) return "";
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function dedupeGalleryImages(images: ProductGalleryImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = imageDedupeKey(image.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function imagesWithFeaturedVariant(
  images: ProductGalleryImage[],
  name: string,
  featuredImageUrl?: string | null,
) {
  const visibleImages = dedupeGalleryImages(images);
  if (!featuredImageUrl) return visibleImages;
  const featuredKey = imageDedupeKey(featuredImageUrl);
  if (!featuredKey || visibleImages.some((image) => imageDedupeKey(image.url) === featuredKey)) return visibleImages;
  return [...visibleImages, { id: `variant-image-${featuredKey}`, url: featuredImageUrl, alt: name }];
}
