import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GoogleLandingView } from "@/components/analytics/google-tracking";
import styles from "@/components/maintenance/maintenance-landing.module.css";
import { getGoogleTrackingConfig } from "@/lib/tracking";
import { isMarket, type Market } from "@/lib/market";
import { scheduleMaintenanceVisitTracking } from "@/lib/noma-traffic";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "NOMA" },
  description: "A NOMA esta preparando uma nova experiencia em interiores.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function TemporaryMaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { market: rawMarket } = await params;
  const market = rawMarket.toUpperCase();
  if (!isMarket(market)) notFound();

  const requestHeaders = await headers();
  scheduleMaintenanceVisitTracking({
    market,
    pathname: requestHeaders.get("x-noma-original-pathname") ?? `/traffic-test/${rawMarket}`,
    referrer: requestHeaders.get("referer"),
    searchParams: await searchParams,
    userAgent: requestHeaders.get("user-agent"),
    sessionId: requestHeaders.get("x-noma-traffic-session"),
  });

  return (
    <div className={styles.page} data-maintenance-landing>
      <header className={styles.header}>
        <div className={styles.brand} aria-label="NOMA">NOMA</div>
        <div className={styles.market}>{market}</div>
      </header>

      <main className={styles.main}>
        <section className={styles.copy} aria-labelledby="maintenance-title">
          <p className={styles.kicker}>Interiores NOMA</p>
          <h1 className={styles.title} id="maintenance-title">Estamos preparando algo novo.</h1>
          <p className={styles.subtitle}>
            A NOMA está passando pelos últimos ajustes para apresentar uma nova experiência em interiores.
          </p>
          <p className={styles.soon}>Volte em breve.</p>
        </section>
        <div className={styles.visual} aria-hidden="true" />
      </main>

      <footer className={styles.footer}>
        <span>NOMA · Furniture & Interiors</span>
      </footer>

      <Suspense fallback={null}>
        <GoogleLandingView config={getGoogleTrackingConfig()} market={market as Market} />
      </Suspense>
    </div>
  );
}
