import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { GlobalBusinessFooter } from "@/components/legal/global-business-footer";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/providers/session-provider";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://www.smoat.co.kr");

const brandImage = "/smoat-logo.png";
const openGraphImage = "/og-image.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SMOAT | 가장 스마트한 해자",
  description: "SMOAT는 영어학원의 운영, 학습 데이터, AI 문제 생성을 하나로 묶어 가장 스마트한 해자를 만드는 AI ERP입니다.",
  applicationName: "SMOAT",
  icons: {
    icon: [
      { url: brandImage, type: "image/png", sizes: "500x500" },
      { url: "/favicon.png", type: "image/png", sizes: "500x500" },
    ],
    shortcut: "/favicon.png",
    apple: [
      { url: "/apple-icon.png", type: "image/png", sizes: "500x500" },
    ],
  },
  appleWebApp: {
    title: "SMOAT",
  },
  openGraph: {
    title: "SMOAT | 가장 스마트한 해자",
    description: "영어학원을 위한 가장 스마트한 AI 운영 해자",
    siteName: "SMOAT",
    url: "/",
    images: [
      {
        url: openGraphImage,
        width: 500,
        height: 500,
        alt: "SMOAT",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "SMOAT | 가장 스마트한 해자",
    description: "영어학원을 위한 가장 스마트한 AI 운영 해자",
    images: [openGraphImage],
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
