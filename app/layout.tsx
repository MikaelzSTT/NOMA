import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import { absoluteUrl } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl()),
  title: { default: "Vitrineo | Produtos e ofertas em um so lugar", template: "%s | Vitrineo" },
  description: "Compare produtos de fontes identificadas e compre diretamente na loja responsavel.",
  applicationName: "Vitrineo",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Vitrineo",
    title: "Vitrineo | Produtos e ofertas em um so lugar",
    description: "Compare produtos de fontes identificadas e compre diretamente na loja responsavel.",
    url: absoluteUrl("/"),
    images: [{ url: "/images/hero-marketplace.webp", width: 1673, height: 940, alt: "Vitrineo" }],
  },
  twitter: { card: "summary_large_image", title: "Vitrineo", description: "Produtos e ofertas de fontes identificadas.", images: ["/images/hero-marketplace.webp"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
