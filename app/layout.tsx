import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const sans = Noto_Sans_SC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const serif = Noto_Serif_SC({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  title: "Aether — 灵魂对话",
  description: "一个受原生艺术精神启发的自由创作与作品交流空间。",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Aether — 灵魂对话",
    description: "作品与语言之间的一层空间。自由创作，认真观看，不替你定义。",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "Aether — 灵魂对话",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aether — 灵魂对话",
    description: "作品与语言之间的一层空间。",
    images: ["/og.jpg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <html lang="zh-CN">
      <body className={`${sans.variable} ${serif.variable}`}>
        {authEnabled ? <ClerkProvider>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
