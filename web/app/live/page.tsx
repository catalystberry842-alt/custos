import type { Metadata } from "next";
import LiveApp from "@/components/LiveApp";

export const metadata: Metadata = {
  title: "Live testnet app · Custos",
  description: "A real Custos vault on Robinhood Chain testnet. Connect a wallet, check in, and watch an AI agent get approved or blocked by the firewall with real transactions.",
};
export default function Page() { return <LiveApp />; }
