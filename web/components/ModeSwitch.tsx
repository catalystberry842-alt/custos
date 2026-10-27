import Link from "next/link";

/** Clear labelled switch between the real testnet app and the offline simulation. */
export default function ModeSwitch({ mode }: { mode: "live" | "sim" }) {
  return (
    <div className="modesw" role="group" aria-label="Mode">
      <Link href="/live" aria-current={mode === "live" ? "page" : undefined} className={mode === "live" ? "on" : ""}><i className="live" />Testnet (live)</Link>
      <Link href="/firewall" aria-current={mode === "sim" ? "page" : undefined} className={mode === "sim" ? "on" : ""}><i />Simulation</Link>
    </div>
  );
}
