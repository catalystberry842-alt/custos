import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heirloom: your crypto shouldn't die with you",
  description: "A non-custodial dead-man's switch for Monad. Simulation demo.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0b0c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap wide">
            <Link href="/" className="logo"><i /> Heirloom</Link>
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
