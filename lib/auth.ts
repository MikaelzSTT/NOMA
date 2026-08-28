import "server-only";
import { compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, requireAdminEnvironment } from "@/lib/env";

const COOKIE_NAME = "vitrineo_admin";

function secretKey() {
  return new TextEncoder().encode(requireAdminEnvironment().secret);
}

export async function validateAdminCredentials(email: string, password: string) {
  const config = requireAdminEnvironment();
  const validPassword = await compare(password, config.passwordHash);
  return validPassword && email.toLocaleLowerCase("pt-BR") === config.email.toLocaleLowerCase("pt-BR");
}

export async function createAdminSession() {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1_000);
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
    .setSubject("admin")
    .sign(secretKey());
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function getAdminSession() {
  try {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.role !== "admin" || payload.sub !== "admin") return null;
    return { email: requireAdminEnvironment().email };
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}
