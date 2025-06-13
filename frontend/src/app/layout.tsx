import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { Viewport } from 'next';

export const metadata: Metadata = {
  title: "Time2Cinema: 查電影場次",
  description: "查詢全台上映中電影場次、票房數據及電影院地圖資訊。Time2Cinema 是時候看部電影了！",
  keywords: [
    "電影時刻表", "票房查詢", "電影院資訊", "電影資訊", "台灣電影院",
    "電影上映", "電影排行", "影城時刻表", "電影院時刻表", "電影推薦"
  ],
  authors: [{ name: "Time2Cinema" }],
  creator: "Time2Cinema",
  publisher: "Time2Cinema",
  verification: {
    google: "jhJRiLVKWEvXoGwFRiabhgdDR27ebG9Ol6Efrag3upI",
    yandex: "d406d1a2955567a2",
    other: {
      me: ["time2cinema@gmail.com"],
    },
  },
  metadataBase: new URL("https://www.time2cinema.com"),
  alternates: {
    canonical: "/",
    languages: {
      "zh-TW": "/",
    },
  },
  openGraph: {
    title: "Time2Cinema: 查電影場次",
    description: "查詢全台上映中電影場次、票房數據及電影院地圖資訊。Time2Cinema 是時候看部電影了！",
    url: "https://www.time2cinema.com",
    siteName: "Time2Cinema",
    images: [
      {
        url: "/time2cinema-og.png",
        width: 1200,
        height: 630,
        alt: "Time2Cinema 查電影場次",
      },
    ],
    locale: "zh_TW",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Time2Cinema: 查電影場次",
    description: "查詢全台上映中電影場次、票房數據及電影院地圖資訊。Time2Cinema 是時候看部電影了！",
    images: ["/time2cinema-logo-square.png"],
    creator: "@time2cinema",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
