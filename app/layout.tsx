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

export const metadata: Metadata = {
  title: "うんｊレゼ",
  description: "お絵描き・ゲーム・雑談ができる匿名掲示板コミュニティ。",
  openGraph: {
    title: "うんｊレゼ",
    description: "お絵描き・ゲーム・雑談ができる匿名掲示板コミュニティ。",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "https://avatars.githubusercontent.com/u/88383494",
  },
  other: {
    "google-site-verification": "umOJryZRtZeDsWC10CFmGjDOJy7SjkpL3DWlXblOnyE",
    "Cache-Control": "no-cache",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
