import { z } from "zod";

const optionalPositiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const optionalSecret = (minimum: number) => z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(minimum).optional(),
);
const optionalEmail = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.email().optional(),
);
const optionalBooleanString = z.preprocess(
  (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
  z.enum(["true", "false"]).default("false"),
);

const environmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://vitrineo:vitrineo@localhost:5432/vitrineo?schema=public"),
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().default("http://localhost:3000"),
  ),
  PUBLIC_MAINTENANCE_MODE: optionalBooleanString,
  SUPPLIER_CONFIG_ENCRYPTION_KEY: optionalSecret(32),
  AUTH_SECRET: optionalSecret(32),
  ADMIN_EMAIL: optionalEmail,
  ADMIN_PASSWORD_HASH: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  SESSION_TTL_HOURS: optionalPositiveInt(8),
  CRON_SECRET: optionalSecret(24),
  MERCADO_PAGO_ACCESS_TOKEN: optionalSecret(20),
  MERCADO_PAGO_WEBHOOK_SECRET: optionalSecret(16),
  SYNC_PRICE_CRON: z.string().default("0 */6 * * *"),
  SYNC_AVAILABILITY_CRON: z.string().default("30 */6 * * *"),
  SYNC_CATALOG_CRON: z.string().default("0 3 * * *"),
  SYNC_BATCH_SIZE: optionalPositiveInt(100),
  SYNC_REQUESTS_PER_SECOND: optionalPositiveInt(2),
  SYNC_MAX_RETRIES: optionalPositiveInt(3),
  SYNC_STALE_HOURS: optionalPositiveInt(24),
  PUBLIC_RATE_LIMIT_PER_MINUTE: optionalPositiveInt(60),
  ADMIN_RATE_LIMIT_PER_MINUTE: optionalPositiveInt(20),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Variaveis de ambiente invalidas: ${details}`);
}

export const env = parsed.data;

export function requireAdminEnvironment() {
  if (!env.AUTH_SECRET || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH) {
    throw new Error(
      "Admin nao configurado. Defina AUTH_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD_HASH.",
    );
  }

  return {
    secret: env.AUTH_SECRET,
    email: env.ADMIN_EMAIL,
    passwordHash: env.ADMIN_PASSWORD_HASH,
  };
}
