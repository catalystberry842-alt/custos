import { NextResponse } from "next/server";
import { isAddress, isHex } from "viem";
import { submitLive } from "@/lib/live/server";
import { fromJson, toJson } from "@/lib/live/json";
import type { SubmitBody } from "@/lib/live/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), w = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  w.push(now); hits.set(ip, w);
  return w.length > 24;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  if (limited(ip)) return NextResponse.json({ error: "slow down: 24 requests per minute" }, { status: 429 });
  let b: SubmitBody;
  try { b = fromJson<SubmitBody>(await req.text()); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!b || !isAddress(b.vault) || !b.tx || !isAddress(b.tx.to) || (b.tx.data !== undefined && !isHex(b.tx.data)) || !Number.isInteger(b.nonce) || b.nonce < 0)
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (b.intent && b.intent.length > 400) b.intent = b.intent.slice(0, 400);
  try {
    return new NextResponse(toJson(await submitLive(b)), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "failed" }, { status: 502 });
  }
}
