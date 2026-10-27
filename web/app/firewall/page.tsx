import type { Metadata } from "next";
import FirewallApp from "@/components/FirewallApp";

export const metadata: Metadata = {
  title: "Agent Firewall · Custos",
  description: "Rules that live outside the AI model. Try prompt injection, over-limit spends, unlimited approvals, unknown contracts, runaway loops and replays against the Custos firewall (simulation).",
};
export default function Page() { return <FirewallApp />; }
