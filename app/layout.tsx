import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Aether — 让作品先出现",
  description: "一个受原生艺术精神启发的自由创作与作品交流空间。",
  metadataBase: new URL("https://github.com/YiXun-13468878779/aether2.0"),
  openGraph: {
    title: "Aether — 让作品先出现",
    description: "作品与语言之间的一层空间。自由创作，认真观看，不替你定义。",
    images: [
      {
        url: "https://raw.githubusercontent.com/YiXun-13468878779/aether2.0/main/public/og.png",
        width: 1200,
        height: 630,
        alt: "Aether — 让作品先出现",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aether — 让作品先出现",
    description: "作品与语言之间的一层空间。",
    images: ["https://raw.githubusercontent.com/YiXun-13468878779/aether2.0/main/public/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
