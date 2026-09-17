export const PRODUCT_IMAGE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PRODUCT_IMAGE_ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
export const PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const PRODUCT_IMAGE_MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const PRODUCT_IMAGE_UPLOAD_ENDPOINT = "/api/admin/product-images/upload";

export function isAcceptedProductImageType(type: string) {
  return PRODUCT_IMAGE_ACCEPTED_TYPES.includes(type as (typeof PRODUCT_IMAGE_ACCEPTED_TYPES)[number]);
}

export function productImageBlobPathname(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `products/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
}

export function formatProductImageBytes(value: number) {
  return `${Math.round(value / 1024 / 1024)} MB`;
}
