import { Suspense } from "react";
import { GoogleTracking } from "@/components/analytics/google-tracking";
import { getGoogleTrackingConfig } from "@/lib/tracking";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <GoogleTracking config={getGoogleTrackingConfig()} />
      </Suspense>
    </>
  );
}
