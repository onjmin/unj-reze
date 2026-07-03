import type { Metadata } from "next";
import { Geist, Geist_Mono, DotGothic16, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { AudioFocusProvider } from '@/lib/audio-focus-context';
import DemoNoticeModal from '@/components/DemoNoticeModal';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dotGothic16 = DotGothic16({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});

const pressStart2P = Press_Start_2P({
  variable: "--font-pixel-en",
  weight: "400",
  subsets: ["latin"],
  preload: false,
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
      className={`${geistSans.variable} ${geistMono.variable} ${dotGothic16.variable} ${pressStart2P.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><AudioFocusProvider>{children}</AudioFocusProvider>{process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true' && <DemoNoticeModal />}</body>
    </html>
  );
}
