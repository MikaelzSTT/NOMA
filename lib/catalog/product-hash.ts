import { createHash } from "node:crypto";
import { slugify } from "@/lib/utils";

export function canonicalProductHash(name: string, brand?: string) {
  const canonical = `${slugify(brand ?? "sem-marca")}:${slugify(name)}`;
  return createHash("sha256").update(canonical).digest("hex");
}
