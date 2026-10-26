import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND.name}: ${BRAND.tagline}`,
  description: `${BRAND.blurb} Non-custodial, built for Robinhood Chain. Security tooling, simulation demo.`,
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0b0c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap wide">
            <Link href="/" className="logo"><i /> {BRAND.name}</Link>
            <nav className="nav">
              <Link href="/setup">Setup</Link>
              <Link href="/dashboard">Demo</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
