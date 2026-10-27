import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { agentAccount, liveState } from "@/lib/live/server";
import { DEPLOY } from "@/lib/live/config";
import { toJson } from "@/lib/live/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const vault = new URL(req.url).searchParams.get("vault") ?? DEPLOY.demoVault;
  if (!isAddress(vault)) return NextResponse.json({ error: "bad vault address" }, { status: 400 });
  try {
    const s = await liveState(vault as `0x${string}`);
    const acct = agentAccount();
    return new NextResponse(toJson({ snap: s.snap, events: s.events, policy: s.policy, nextNonce: s.nextNonce, spendCount: s.spendCount, agentKeyConfigured: !!acct, agentMatches: !!acct && acct.address.toLowerCase() === s.snap.agent.toLowerCase() }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "state failed" }, { status: 502 });
  }
}
