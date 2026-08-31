import type { ImportedProductImage } from "@/lib/product-import/types";

export interface HtmlTag {
  attrs: Record<string, string>;
  inner?: string;
}

const entityMap: Record<string, string> = {
  amp: "&",
  quot: "\"",
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  cedil: "ç",
  Ccedil: "Ç",
  atilde: "ã",
  Atilde: "Ã",
  otilde: "õ",
  Otilde: "Õ",
  aacute: "á",
  Aacute: "Á",
  eacute: "é",
  Eacute: "É",
  iacute: "í",
  Iacute: "Í",
  oacute: "ó",
  Oacute: "Ó",
  uacute: "ú",
  Uacute: "Ú",
  acirc: "â",
  Acirc: "Â",
  ecirc: "ê",
  Ecirc: "Ê",
};

export function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z][\w-]+);/g, (match, name) => entityMap[name] ?? match);
}

export function compactText(value?: string) {
  const text = decodeHtml(String(value ?? ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

export function truncateText(value: string | undefined, max: number) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed;
}

export function extractTags(html: string, tagName: string): HtmlTag[] {
  const tags: HtmlTag[] = [];
  const paired = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = paired.exec(html))) tags.push({ attrs: parseAttrs(match[1] ?? ""), inner: match[2] ?? "" });
  if (tags.length === 0 || ["meta", "link", "img", "input"].includes(tagName.toLowerCase())) {
    const single = new RegExp(`<${tagName}\\b([^>]*)\\/?>`, "gi");
    while ((match = single.exec(html))) tags.push({ attrs: parseAttrs(match[1] ?? "") });
  }
  return tags;
}

export function parseAttrs(source: string) {
  const attrs: Record<string, string> = {};
  const attrPattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

export function readMeta(html: string) {
  const meta: Record<string, string[]> = {};
  for (const tag of extractTags(html, "meta")) {
    const key = tag.attrs.property || tag.attrs.name || tag.attrs.itemprop;
    const content = tag.attrs.content;
    if (!key || !content) continue;
    const normalized = key.toLowerCase();
    meta[normalized] = [...(meta[normalized] ?? []), content.trim()];
  }
  return meta;
}

export function firstMeta(meta: Record<string, string[]>, keys: string[]) {
  for (const key of keys) {
    const value = meta[key.toLowerCase()]?.find(Boolean);
    if (value) return compactText(value);
  }
  return undefined;
}

export function extractCanonicalUrl(html: string, baseUrl: URL) {
  for (const tag of extractTags(html, "link")) {
    if (tag.attrs.rel?.toLowerCase().split(/\s+/).includes("canonical") && tag.attrs.href) {
      return absoluteUrl(tag.attrs.href, baseUrl);
    }
  }
  return undefined;
}

export function absoluteUrl(raw: string | undefined, baseUrl: URL) {
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) return undefined;
  try {
    return new URL(decodeHtml(raw.trim()), baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function htmlImages(html: string, baseUrl: URL): ImportedProductImage[] {
  return extractTags(html, "img").flatMap((tag) => {
    const candidate = tag.attrs["data-src"] || tag.attrs["data-zoom"] || tag.attrs["data-image"] || tag.attrs.src;
    const url = absoluteUrl(candidate, baseUrl);
    if (!url) return [];
    return [{
      url,
      alt: compactText(tag.attrs.alt),
      width: toNumber(tag.attrs.width),
      height: toNumber(tag.attrs.height),
      source: "html" as const,
    }];
  });
}

export function jsonFromScriptAssignments(html: string, variableNames: string[]) {
  const values: unknown[] = [];
  for (const script of extractTags(html, "script")) {
    const inner = script.inner ?? "";
    for (const variableName of variableNames) {
      const pattern = new RegExp(`${escapeRegExp(variableName)}\\s*=\\s*`, "g");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(inner))) {
        const json = balancedJsonAt(inner, match.index + match[0].length);
        if (!json) continue;
        const parsed = parseLooseJson(json);
        if (parsed != null) values.push(parsed);
      }
    }
  }
  return values;
}

export function jsonLdBlocks(html: string) {
  return extractTags(html, "script")
    .filter((tag) => tag.attrs.type?.toLowerCase().includes("ld+json"))
    .flatMap((tag) => {
      const parsed = parseLooseJson(decodeHtml((tag.inner ?? "").replace(/^\s*<!--|-->\s*$/g, "")));
      return parsed == null ? [] : [parsed];
    });
}

export function parseLooseJson(source: string) {
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

export function balancedJsonAt(source: string, start: number) {
  let index = start;
  while (/\s/.test(source[index] ?? "")) index += 1;
  const open = source[index];
  const close = open === "{" ? "}" : open === "[" ? "]" : undefined;
  if (!close) return undefined;
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return source.slice(index, cursor + 1);
  }
  return undefined;
}

export function findFirstTextByPattern(html: string, pattern: RegExp) {
  const match = pattern.exec(html);
  return compactText(match?.[1]);
}

function toNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
