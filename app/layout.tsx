import type { Metadata } from "next";
import { Geist, Geist_Mono, DotGothic16, Press_Start_2P } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AudioFocusProvider } from '@/lib/audio-focus-context';
import DemoNoticeModal from '@/components/DemoNoticeModal';
import { SITE_NAME, SITE_URL } from '@/lib/site';

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

const description = "お絵描き・ゲーム・雑談ができる匿名掲示板コミュニティ。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: SITE_NAME,
    description,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description,
  },
  icons: {
    icon: "https://avatars.githubusercontent.com/u/88383494",
  },
  other: {
    "google-site-verification": "cMogkuhgfKNyue0pALIrQx9G9ClFbSeRo5CqLomVgVk",
    "Cache-Control": "no-cache",
  },
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  description,
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-HL7EMH1N1B"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-HL7EMH1N1B');
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col"><AudioFocusProvider>{children}</AudioFocusProvider>{process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true' && <DemoNoticeModal />}</body>
    </html>
  );
}
