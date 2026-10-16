import { Suspense } from "react";
import { GoogleTagManager, GoogleTagManagerNoScript } from "@/components/analytics/google-tag-manager";
import { GoogleTracking } from "@/components/analytics/google-tracking";
import { NomaTrafficRecorder } from "@/components/traffic/noma-traffic-recorder";
import { getGoogleTrackingConfig } from "@/lib/tracking";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleTagManagerNoScript />
      <GoogleTagManager />
      <NomaTrafficRecorder />
      {children}
      <Suspense fallback={null}>
        <GoogleTracking config={getGoogleTrackingConfig()} />
      </Suspense>
    </>
  );
}
