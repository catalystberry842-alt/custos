import { BRAND } from "./brand.js";
import { createServer, type Server } from "node:http";
import type { Agent } from "./agent.js";

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b0b0c;color:#e8e8ea;font:15px/1.45 -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;padding:16px}
main{width:100%;max-width:360px}
h1{font-size:18px;margin:0 0 6px}p{color:#9a9aa2;margin:0 0 14px;font-size:14px}
button{background:#f5b942;color:#1a1200;border:0;border-radius:8px;padding:10px 16px;font:600 14px inherit;cursor:pointer}
small{display:block;margin-top:14px;color:#6b6b73;font-size:12px}
</style></head><body><main>${body}<small>${BRAND.name} check-in · simulated mode if no chain is configured</small></main></body></html>`;

export function createCheckInServer(agent: Agent): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const m = /^\/c\/([A-Za-z0-9_.-]{3,200})$/.exec(url.pathname);
    const send = (code: number, html: string, type = "text/html; charset=utf-8") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer" });
      res.end(html);
    };
    if (url.pathname === "/health") return send(200, JSON.stringify({ ok: true }), "application/json");
    if (!m) return send(404, page("Not found", "<h1>Not found</h1>"));
    const token = m[1]!;
    if (req.method === "GET") {
      // GET never mutates: link scanners / previews must not be able to check in for the owner.
      const v = await agent.verifyToken(token);
      if (!v) return send(410, page("Link expired", "<h1>Link expired</h1><p>This link is no longer valid. You may already have checked in.</p>"));
      return send(200, page("Check in", `<h1>Hi ${esc(v.profile.owner.name)}, still here?</h1><p>One tap restarts your ${BRAND.name} timer.</p><form method="post"><button>I'm here ✓</button></form>`));
    }
    if (req.method === "POST") {
      const r = await agent.checkInViaToken(token);
      return send(r.ok ? 200 : 410, page("Check in", `<h1>${r.ok ? "You're all set ✓" : "Not checked in"}</h1><p>${esc(r.message)}</p>`));
    }
    return send(405, "method not allowed", "text/plain");
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
