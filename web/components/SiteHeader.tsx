import Link from "next/link";
import { Wordmark } from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function SiteHeader() {
  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" aria-label="Custos home"><Wordmark /></Link>
        <nav className="nav" aria-label="Main">
          <Link href="/setup">Set up</Link>
          <Link href="/dashboard">Demo</Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
