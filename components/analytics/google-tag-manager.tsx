import Script from "next/script";

const GOOGLE_TAG_MANAGER_ID = "GTM-T8ZDJ45R";

export function GoogleTagManager() {
  return (
    <Script
      id="noma-google-tag-manager"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        // The official bootstrap preserves the dataLayer shared with gtag.js
        // and inserts the async container before the first script (in <head>).
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');`,
      }}
    />
  );
}

export function GoogleTagManagerNoScript() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GOOGLE_TAG_MANAGER_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
