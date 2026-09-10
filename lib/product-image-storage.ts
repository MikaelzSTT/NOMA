export function productImageStorageFields(url: string) {
  if (url.startsWith("/")) {
    return { storageKey: url, storageStatus: "STORED" as const };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && (parsed.hostname === "blob.vercel-storage.com" || parsed.hostname.endsWith(".blob.vercel-storage.com"))) {
      return { storageKey: parsed.pathname.replace(/^\/+/, ""), storageStatus: "STORED" as const };
    }
  } catch {
    return { storageKey: null, storageStatus: "EXTERNAL" as const };
  }

  return { storageKey: null, storageStatus: "EXTERNAL" as const };
}
