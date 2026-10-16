import type { Metadata } from "next";
import { Inter, Sora, Unbounded } from "next/font/google";
import "./globals.css";

// The body font is set in this one place. The designers chose Inter on
// 2026-10-11 in place of Aptos, which cannot be served from a website.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const headingFont = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  // 500 is the heading weight in the typography frame. 600 and 700 stay until
  // every screen has moved to it.
  weight: ["500", "600", "700"],
});

// Number text (amounts, counts), from the typography frame.
const numberFont = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CENSE",
  description: "Clear, personalized guidance for your first credit card.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${headingFont.variable} ${numberFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
