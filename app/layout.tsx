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
  title: { default: "Noma | Móveis e interiores", template: "%s | Noma" },
  description: "Mobiliário, interiores e marcenaria pensados como um só projeto.",
  applicationName: "Noma",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Noma",
    title: "Noma | Móveis e interiores",
    description: "Mobiliário, interiores e marcenaria pensados como um só projeto.",
    url: absoluteUrl("/"),
    images: [{ url: "/images/noma/living-room.webp", width: 1673, height: 940, alt: "Noma Interiores" }],
  },
  twitter: { card: "summary_large_image", title: "Noma", description: "Móveis e interiores para uma vida mais presente.", images: ["/images/noma/living-room.webp"] },
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
