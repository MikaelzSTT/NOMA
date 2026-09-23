import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("CSP do Google Ads", () => {
  it("libera os endpoints necessarios para a conversao e o Tag Assistant", async () => {
    const rules = await nextConfig.headers?.();
    const policy = rules?.[0]?.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;

    expect(policy).toBeDefined();
    expect(directive(policy!, "script-src")).toEqual(expect.arrayContaining([
      "https://www.googletagmanager.com",
      "https://www.googleadservices.com",
      "https://googleads.g.doubleclick.net",
      "https://www.google.com",
    ]));
    expect(directive(policy!, "connect-src")).toEqual(expect.arrayContaining([
      "https://www.googletagmanager.com",
      "https://www.googleadservices.com",
      "https://googleads.g.doubleclick.net",
      "https://pagead2.googlesyndication.com",
      "https://www.google.com",
      "https://www.google.com.br",
      "https://ad.doubleclick.net",
    ]));
    expect(directive(policy!, "frame-src")).toContain("https://www.googletagmanager.com");
  });
});

function directive(policy: string, name: string) {
  const value = policy.split("; ").find((part) => part.startsWith(`${name} `));
  return value?.split(" ").slice(1) ?? [];
}
