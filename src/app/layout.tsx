import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DUCTly - UAE's #1 Duct Cleaning & Maintenance Company",
  description:
    "We remove dust, allergens, and debris from your HVAC system so your family can breathe the cleanest air possible while saving on energy bills.",
  icons: { icon: "/images/favicon.png" },
  openGraph: {
    title: "DUCTly - UAE's #1 Duct Cleaning & Maintenance Company",
    description:
      "We remove dust, allergens, and debris from your HVAC system so your family can breathe the cleanest air possible while saving on energy bills.",
    url: "https://ductly.ae",
    siteName: "DUCTly",
    locale: "en_AE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DUCTly - UAE's #1 Duct Cleaning & Maintenance Company",
    description:
      "We remove dust, allergens, and debris from your HVAC system so your family can breathe the cleanest air possible while saving on energy bills.",
  },
  metadataBase: new URL("https://ductly.ae"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          href="https://fonts.googleapis.com/css2?family=Questrial&family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/font/sans/style.min.css"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: "DUCTly",
              description: "UAE's #1 Duct Cleaning & Maintenance Company",
              url: "https://ductly.ae",
              email: "info@ductly.ae",
              areaServed: { "@type": "Country", name: "United Arab Emirates" },
              serviceType: ["Duct Cleaning", "HVAC Maintenance", "Mold Remediation"],
            }),
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
