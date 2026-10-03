// Kobo-style survey API (Silo C), mounted on the main server at /kobo. Zetaris reads it as an API source.
// Requires KOBO_TOKEN: callers send "Authorization: Token <value>". Without a token the routes are disabled.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export function createKoboHandler(opts: { token?: string; dir?: string }) {
  const dir = opts.dir ?? path.resolve(import.meta.dirname ?? ".", "../data/kobo");
  const load = (n: string) => parseCsv(fs.readFileSync(path.join(dir, n), "utf-8"));
  const kpis = load("kpi_definitions.csv");
  const subs: Record<string, any>[] = load("kobo_submissions.csv").map((r) => ({ ...r, value: Number(r.value), sample_size: r.sample_size ? Number(r.sample_size) : null }));
  const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  /** Returns true if it handled the request. */
  return (req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean => {
    if (!url.pathname.startsWith("/kobo/")) return false;
    const send = (code: number, body: unknown) => { const b = JSON.stringify(body); res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b) }); res.end(b); };
    if (!opts.token) { send(404, { detail: "not found" }); return true; }
    if (!same(String(req.headers.authorization ?? ""), `Token ${opts.token}`)) { send(401, { detail: "invalid token" }); return true; }
    const parts = url.pathname.split("/").filter(Boolean).slice(1); // drop "kobo"
    if (req.method !== "GET") { send(405, { detail: "read only" }); return true; }
    if (parts.join("/") === "api/v2/kpis") { send(200, { count: kpis.length, results: kpis }); return true; }
    if (parts.join("/") === "api/v2/assets") { const f = [...new Set(kpis.map((k) => k.form_id))].sort(); send(200, { count: f.length, results: f.map((uid) => ({ uid })) }); return true; }
    if (parts.length === 5 && parts[0] === "api" && parts[1] === "v2" && parts[2] === "assets" && parts[4] === "data") {
      let rows = subs.filter((r) => r.form_id === parts[3]);
      for (const k of ["kpi_id", "project_id", "ward"] as const) { const v = url.searchParams.get(k); if (v) rows = rows.filter((r) => r[k] === v); }
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 100))), off = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
      const next = off + limit < rows.length ? `${url.pathname}?limit=${limit}&offset=${off + limit}` : null;
      send(200, { count: rows.length, next, results: rows.slice(off, off + limit) }); return true;
    }
    send(404, { detail: "not found" }); return true;
  };
}
