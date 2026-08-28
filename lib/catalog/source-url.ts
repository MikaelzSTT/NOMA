const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|mc_|msclkid$|yclid$|igshid$)/i;

export function normalizeSourceUrl(value?: string) {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("/")) return raw.replace(/\/+$/, "") || "/";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  if (!["http:", "https:"].includes(url.protocol)) return raw;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }

  const sorted = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
  url.search = "";
  for (const [key, item] of sorted) url.searchParams.append(key, item);

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
