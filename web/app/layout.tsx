import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./visuals.css";
import "./motion.css";
import "./firewall.css";
import SiteHeader from "@/components/SiteHeader";
import { THEME_INIT } from "@/components/ThemeToggle";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND.name}: ${BRAND.tagline}`,
  description: `${BRAND.blurb} Non-custodial, built for Robinhood Chain. Security tooling, simulation demo.`,
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F7F6F3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
