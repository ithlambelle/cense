import type { Metadata } from "next";
import { Google_Sans, Inter, Sora, Unbounded } from "next/font/google";
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
  // Sora Medium is the heading weight in the typography frame ("Sora headings
  // use Medium as the maximum weight").
  weight: ["500"],
});

// Only for the "Continue with Google" button: Google's sign-in branding
// guidelines set its label in Google Sans Medium.
// https://developers.google.com/identity/branding-guidelines
const googleFont = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  weight: ["500"],
  // Next has no size-adjust values for Google Sans, so a plain fallback is named.
  adjustFontFallback: false,
  fallback: ["Arial", "sans-serif"],
  // Used only on the sign-in screens, so it is not preloaded on every page.
  preload: false,
});

// Number text (amounts, counts), from the typography frame.
const numberFont = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["400", "500"],
  // Used on Home, results, card pages and the denial steps, not on Welcome,
  // where preloading it competed with the mascot image.
  preload: false,
});

export const metadata: Metadata = {
  title: "CENSE",
  description: "Clear, personalized guidance for your first credit card.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${headingFont.variable} ${numberFont.variable} ${googleFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
