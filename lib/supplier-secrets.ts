import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

function encryptionKey() {
  if (!env.SUPPLIER_CONFIG_ENCRYPTION_KEY) {
    throw new Error("Defina SUPPLIER_CONFIG_ENCRYPTION_KEY para armazenar credenciais de fornecedores.");
  }
  return createHash("sha256").update(env.SUPPLIER_CONFIG_ENCRYPTION_KEY).digest();
}

export function encryptSupplierCredentials(credentials: Record<string, string>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSupplierCredentials(value?: string | null) {
  if (!value) return undefined;
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Credencial criptografada invalida.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as Record<string, string>;
}
