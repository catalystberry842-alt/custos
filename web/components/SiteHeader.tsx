import Link from "next/link";
import { Wordmark } from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function SiteHeader() {
  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" aria-label="Custos home"><Wordmark /></Link>
        <nav className="nav" aria-label="Main">
          <Link href="/live">Live app</Link>
          <Link href="/firewall">Simulation</Link>
          <Link href="/#how" className="hide-sm">How it works</Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
