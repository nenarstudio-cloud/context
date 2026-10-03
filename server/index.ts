// HTTP server for the Context UI. No framework.
// Production safeguards: shared demo password (DEMO_PASSWORD), signed session cookie, login rate limit,
// ask quotas (cost control), JSON-only POSTs, security headers, health check, optional Kobo API at /kobo.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../src/config.ts";
import { createRuntime, seed } from "../src/runtime.ts";
import { investigate, type AgentEvent } from "../src/agent/investigate.ts";
import { replayInvestigate, replaySupported } from "../src/agent/replay.ts";
import { runTool } from "../src/tools/index.ts";
import { lit, projectId, T } from "../src/tools/sql.ts";
import { createKoboHandler } from "./kobo.ts";

const WEB = path.resolve(import.meta.dirname ?? ".", "../web");
const DEFAULT_ACTOR = "p11"; // the Executive Director; replace with per-user auth if you outgrow the shared password
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export interface ServerOptions {
  port?: number; host?: string; ephemeral?: boolean; password?: string; sessionSecret?: string;
  koboToken?: string; koboDir?: string; askPerHour?: number; askPerDay?: number; hasKey?: boolean;
}

export async function startServer(o: ServerOptions = {}) {
  const port = o.port ?? num(process.env.PORT, 8787);
  const host = o.host ?? process.env.HOST ?? "127.0.0.1";
  const ephemeral = o.ephemeral ?? process.env.CONTEXT_EPHEMERAL === "1";
  const password = o.password ?? process.env.DEMO_PASSWORD ?? "";
  const secret = o.sessionSecret ?? process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString("hex");
  const askPerHour = o.askPerHour ?? num(process.env.MAX_ASKS_PER_HOUR, 30);
  const askPerDay = o.askPerDay ?? num(process.env.MAX_ASKS_PER_DAY, 200);
  const hasKey = o.hasKey ?? !!process.env.ANTHROPIC_API_KEY;
  const kobo = createKoboHandler({ token: o.koboToken ?? process.env.KOBO_TOKEN, dir: o.koboDir ?? process.env.KOBO_DATA_DIR });

  const persisted = !ephemeral && fs.existsSync(config.stateDir);
  const { ctx, close } = await createRuntime({ ephemeral });
  if (!persisted) await seed(ctx);
  let busy: Promise<unknown> = Promise.resolve(); // one investigation at a time: shared memory and graph

  // ---------- auth ----------
  const sign = (payload: string) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const makeToken = () => { const p = `${Date.now() + 12 * 3600e3}.${crypto.randomBytes(8).toString("hex")}`; return `${p}.${sign(p)}`; };
  const tokenOk = (t: string) => { const i = t.lastIndexOf("."); if (i < 0) return false; const p = t.slice(0, i); return same(t.slice(i + 1), sign(p)) && Number(p.split(".")[0]) > Date.now(); };
  const cookieToken = (req: http.IncomingMessage) => /(?:^|;\s*)ctx_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "";
  const authed = (req: http.IncomingMessage) => !password || tokenOk(cookieToken(req));
  const fails = new Map<string, number[]>();
  const ipOf = (req: http.IncomingMessage) => String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();

  // ---------- quotas (cost control) ----------
  const asks: { t: number; who: string }[] = [];
  const quota = (who: string) => {
    const now = Date.now(); while (asks.length && now - asks[0].t > 86400e3) asks.shift();
    if (asks.length >= askPerDay) return `Daily limit of ${askPerDay} questions reached. Try again tomorrow.`;
    if (asks.filter((a) => a.who === who && now - a.t < 3600e3).length >= askPerHour) return `Hourly limit of ${askPerHour} questions reached.`;
    asks.push({ t: now, who }); return null;
  };

  const baseHeaders = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" };
  const json = (res: http.ServerResponse, code: number, body: unknown, extra: Record<string, string> = {}) => {
    const b = JSON.stringify(body); res.writeHead(code, { ...baseHeaders, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b), ...extra }); res.end(b);
  };
  const readBody = (req: http.IncomingMessage) => new Promise<any>((resolve, reject) => {
    if (!String(req.headers["content-type"] ?? "").includes("application/json")) return reject(Object.assign(new Error("content-type must be application/json"), { code: 415 }));
    let d = ""; req.on("data", (c) => { d += c; if (d.length > 20000) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error("invalid json")); } });
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    try {
      if (kobo(req, res, url)) return;
      if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { ok: true });
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        res.writeHead(200, { ...baseHeaders, "Content-Type": "text/html; charset=utf-8" }); return res.end(fs.readFileSync(path.join(WEB, "index.html")));
      }
      if (req.method === "POST" && url.pathname === "/api/login") {
        const ip = ipOf(req), now = Date.now();
        const recent = (fails.get(ip) ?? []).filter((t) => now - t < 600e3); fails.set(ip, recent);
        if (recent.length >= 5) return json(res, 429, { error: "Too many attempts. Wait 10 minutes." });
        const b = await readBody(req);
        if (!password || !same(String(b.password ?? ""), password)) { recent.push(now); return json(res, 401, { error: "Wrong password" }); }
        const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
        return json(res, 200, { ok: true }, { "Set-Cookie": `ctx_session=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` });
      }
      if (url.pathname.startsWith("/api/") && !authed(req)) return json(res, 401, { error: "login required", login: true });

      if (req.method === "GET" && url.pathname === "/api/meta") {
        return json(res, 200, { asOf: ctx.asOf, mode: hasKey ? "live" : "replay", model: hasKey ? config.model : null, dataMode: ctx.data.mode, graph: ctx.memory.stats(), supported: hasKey ? [] : replaySupported });
      }
      if (req.method === "GET" && url.pathname === "/api/projects") return json(res, 200, (await runTool("project_health", {}, ctx)).rows);
      if (req.method === "GET" && url.pathname === "/api/graph") {
        const p = projectId(url.searchParams.get("project") ?? "pr1");
        return json(res, 200, ctx.memory.neighborhood(`project:ops:${p}`, Math.min(3, Math.max(1, Number(url.searchParams.get("depth") ?? 2)))));
      }
      if (req.method === "GET" && url.pathname === "/api/evidence") {
        const conds: string[] = [];
        for (const r of (url.searchParams.get("refs") ?? "").split(",").filter(Boolean).slice(0, 20)) if (/^doc-\d{3}#\d{1,2}$/.test(r)) conds.push(`c.chunk_id = ${lit(r)}`);
        const doc = url.searchParams.get("doc");
        if (doc && /^doc-\d{3}$/.test(doc)) conds.push(`c.doc_id = ${lit(doc)}`);
        if (!conds.length) return json(res, 200, []);
        return json(res, 200, await ctx.data.query(`SELECT c.chunk_id, d.title, d.doc_type, d.created_on, d.source_system, d.source_path, d.project_id, p.name AS project_name, c.text
          FROM ${T.docs("document_chunks")} c JOIN ${T.docs("documents")} d ON d.doc_id = c.doc_id LEFT JOIN ${T.ops("projects")} p ON p.project_id = d.project_id
          WHERE ${conds.join(" OR ")} ORDER BY c.chunk_id`));
      }
      if (req.method === "GET" && url.pathname === "/api/decisions") return json(res, 200, await ctx.writer.list());
      const m = url.pathname.match(/^\/api\/decisions\/(dec[a-z0-9-]+)$/);
      if (req.method === "POST" && m) {
        const b = await readBody(req);
        if (!["Approved", "Rejected", "Deferred"].includes(b.status)) return json(res, 400, { error: "status must be Approved, Rejected or Deferred" });
        const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null;
        const row = await ctx.writer.decide({ decisionId: m[1], status: b.status, decidedBy: DEFAULT_ACTOR, decidedAt: ctx.asOf, outcome: note });
        if (!row) return json(res, 409, { error: "decision not found or already decided" });
        return json(res, 200, { ...row, memory_id: ctx.memory.rememberOutcome({ projectId: String(row.project_id), decisionId: m[1], title: String(row.title), status: b.status, outcome: note }) });
      }
      if (req.method === "POST" && url.pathname === "/api/ask") {
        const b = await readBody(req);
        const question = String(b.question ?? "").trim().slice(0, 600);
        if (!question) return json(res, 400, { error: "question required" });
        const limited = quota(cookieToken(req) || ipOf(req));
        if (limited) return json(res, 429, { error: limited });
        res.writeHead(200, { ...baseHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
        const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
        const run = async () => {
          const live = hasKey && b.mode !== "replay";
          send({ type: "start", mode: live ? "live" : "replay" }); ctx.findingIds.length = 0;
          try { if (live) await investigate(question, ctx, { onEvent: (e: AgentEvent) => send(e) }); else await replayInvestigate(question, ctx, (e) => send(e)); }
          catch (e) { console.error("investigation failed:", (e as Error).message); send({ type: "error", message: "The investigation failed. Check the server log." }); }
          send({ type: "done", graph: ctx.memory.stats() }); res.end();
        };
        busy = busy.then(run, run); return;
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      const code = (e as { code?: number }).code === 415 ? 415 : 400;
      if (!res.headersSent) json(res, code, { error: (e as Error).message }); else res.end();
    }
  });
  await new Promise<void>((r) => server.listen(port, host, r));
  const addr = server.address() as { port: number };
  return { port: addr.port, stop: async () => { await new Promise((r) => server.close(r)); await close(); }, ctx, passwordProtected: !!password };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer();
  const host = process.env.HOST ?? "127.0.0.1", live = !!process.env.ANTHROPIC_API_KEY;
  console.log(`Context on http://${host}:${s.port}  (${live ? "LIVE model: " + config.model : "REPLAY mode: no ANTHROPIC_API_KEY"}; ${s.passwordProtected ? "password protected" : "NO PASSWORD"})`);
  if (host !== "127.0.0.1" && host !== "localhost" && !s.passwordProtected) console.warn("WARNING: listening on a public interface without DEMO_PASSWORD. Anyone can approve decisions and spend your API credits.");
  process.on("SIGTERM", async () => { await s.stop(); process.exit(0); });
}
