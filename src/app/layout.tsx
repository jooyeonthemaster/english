import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { GlobalBusinessFooter } from "@/components/legal/global-business-footer";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/providers/session-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE } from "@/lib/seo/config";
import {
  organizationSchema,
  websiteSchema,
} from "@/lib/seo/structured-data";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.defaultTitle,
    template: SITE.titleTemplate,
  },
  description: SITE.defaultDescription,
  applicationName: "SMOAT",
  keywords: [...SITE.keywords],
  alternates: { canonical: "/" },
  authors: [{ name: SITE.legalName }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  category: "education",
  icons: {
    icon: [
      { url: "/smoat-logo.png", type: "image/png", sizes: "500x500" },
      { url: "/favicon.png", type: "image/png", sizes: "500x500" },
    ],
    shortcut: "/favicon.png",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "500x500" }],
  },
  appleWebApp: {
    title: "SMOAT",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    siteName: "SMOAT",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    ...(SITE.verification.google ? { google: SITE.verification.google } : {}),
    ...(SITE.verification.naver
      ? { other: { "naver-site-verification": SITE.verification.naver } }
      : {}),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <JsonLd
          id="ld-global"
          data={[organizationSchema(), websiteSchema()]}
        />
      </head>
      <body className={`${geistMono.variable} smoat-large-ui font-sans antialiased`}>
        <Providers>
          {children}
          <GlobalBusinessFooter />
        </Providers>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
