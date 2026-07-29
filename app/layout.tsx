import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, DotGothic16, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { AudioFocusProvider } from '@/lib/audio-focus-context';
import DemoNoticeModal from '@/components/DemoNoticeModal';
import PwaRegister from '@/components/PwaRegister';
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, assetPath } from '@/lib/site';

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

const description = SITE_DESCRIPTION;

export const viewport: Viewport = {
  themeColor: "#0b0e14",
  colorScheme: "dark",
};

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
  // アイコンは metadataBase による絶対URL化に巻き込まれないよう、
  // basePath を明示した相対パスを <head> に直接書く（下の RootLayout を参照）。
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
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
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${dotGothic16.variable} ${pressStart2P.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href={assetPath('/icon-192.png')} type="image/png" sizes="192x192" />
        <link rel="icon" href={assetPath('/icon-512.png')} type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href={assetPath('/apple-icon.png')} sizes="180x180" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-HL7EMH1N1B"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());

              gtag('config', 'G-HL7EMH1N1B');
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col"><AudioFocusProvider>{children}</AudioFocusProvider><PwaRegister />{process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true' && <DemoNoticeModal />}</body>
    </html>
  );
}
