// Tests the production safeguards: password gate, session cookie, login rate limit, CSRF-style JSON rule,
// ask quotas, health check, security headers, and the Kobo API token. Run: npm run deploy-test
import { startServer } from "../server/index.ts";
let failed = 0, total = 0;
const check = (n: string, ok: boolean, d = "") => { total++; if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? "  " + d : ""}`); };
const J = { "Content-Type": "application/json" };

const s = await startServer({ port: 0, ephemeral: true, password: "correct horse", sessionSecret: "test-secret", koboToken: "kobo-tok", askPerHour: 2, askPerDay: 50, hasKey: false });
const b = `http://127.0.0.1:${s.port}`;
try {
  check("health check is public", (await fetch(b + "/healthz")).status === 200);
  const page = await fetch(b + "/");
  check("page loads without login and has security headers", page.status === 200 && page.headers.get("x-frame-options") === "DENY" && page.headers.get("x-content-type-options") === "nosniff");
  for (const p of ["/api/meta", "/api/decisions", "/api/projects", "/api/graph?project=pr1", "/api/evidence?doc=doc-001"]) check(`${p} requires login`, (await fetch(b + p)).status === 401);
  check("ask requires login", (await fetch(b + "/api/ask", { method: "POST", headers: J, body: JSON.stringify({ question: "x" }) })).status === 401);
  check("approving a decision requires login", (await fetch(b + "/api/decisions/dec01", { method: "POST", headers: J, body: JSON.stringify({ status: "Approved" }) })).status === 401);

  const bad = await fetch(b + "/api/login", { method: "POST", headers: J, body: JSON.stringify({ password: "nope" }) });
  check("wrong password rejected, no cookie", bad.status === 401 && !bad.headers.get("set-cookie"));
  const good = await fetch(b + "/api/login", { method: "POST", headers: J, body: JSON.stringify({ password: "correct horse" }) });
  const setc = good.headers.get("set-cookie") ?? "";
  check("right password sets an HttpOnly SameSite=Strict cookie", good.status === 200 && /HttpOnly/.test(setc) && /SameSite=Strict/.test(setc));
  const cookie = setc.split(";")[0];
  const H = { ...J, Cookie: cookie };
  check("session cookie unlocks the API", (await fetch(b + "/api/meta", { headers: { Cookie: cookie } })).status === 200);
  check("tampered cookie is rejected", (await fetch(b + "/api/meta", { headers: { Cookie: cookie.slice(0, -3) + "abc" } })).status === 401);
  check("forged cookie is rejected", (await fetch(b + "/api/meta", { headers: { Cookie: `ctx_session=${Date.now() + 1e9}.aa.bb` } })).status === 401);
  const secure = await fetch(b + "/api/login", { method: "POST", headers: { ...J, "x-forwarded-proto": "https" }, body: JSON.stringify({ password: "correct horse" }) });
  check("cookie is Secure behind https", /Secure/.test(secure.headers.get("set-cookie") ?? ""));

  check("POST without JSON content type is refused (415)", (await fetch(b + "/api/decisions/dec01", { method: "POST", headers: { Cookie: cookie, "Content-Type": "text/plain" }, body: "{}" })).status === 415);

  // quotas: limit 2 per hour per session
  const ask = () => fetch(b + "/api/ask", { method: "POST", headers: H, body: JSON.stringify({ question: "Why is Turkana Water Access at risk of missing its Q3 milestone?" }) });
  const a1 = await ask(); await a1.text(); const a2 = await ask(); await a2.text();
  const a3 = await ask();
  check("two asks allowed, third is blocked by the hourly quota (429)", a1.status === 200 && a2.status === 200 && a3.status === 429, String(a3.status));
  check("quota message is clear", /Hourly limit/.test((await a3.json()).error));

  // login rate limit: 5 failures per ip, then locked even for the right password
  let last = 0; for (let i = 0; i < 6; i++) last = (await fetch(b + "/api/login", { method: "POST", headers: { ...J, "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ password: "bad" + i }) })).status;
  check("login is rate limited after repeated failures (429)", last === 429);
  const locked = await fetch(b + "/api/login", { method: "POST", headers: { ...J, "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ password: "correct horse" }) });
  check("a locked-out address cannot log in even with the right password", locked.status === 429);

  // Kobo API
  const K = (p: string, tok?: string) => fetch(b + "/kobo" + p, { headers: tok ? { Authorization: `Token ${tok}` } : {} });
  check("Kobo API without token is 401", (await K("/api/v2/kpis")).status === 401);
  check("Kobo API with wrong token is 401", (await K("/api/v2/kpis", "wrong")).status === 401);
  const kp = await (await K("/api/v2/kpis", "kobo-tok")).json();
  check("Kobo API lists 13 KPIs", kp.count === 13);
  const d = await (await K("/api/v2/assets/borehole_audit/data/?kpi_id=K1&ward=ALL&limit=5", "kobo-tok")).json();
  check("Kobo API pages survey data", d.count === 18 && d.results.length === 5 && !!d.next && typeof d.results[0].value === "number", `${d.count} rows`);
  check("Kobo API does not need the demo cookie (machine access)", (await K("/api/v2/assets", "kobo-tok")).status === 200);
  check("Kobo API is read only", (await fetch(b + "/kobo/api/v2/kpis", { method: "POST", headers: { Authorization: "Token kobo-tok" } })).status === 405);

  // fresh start reseeds decisions
  check("server started from ephemeral state and seeded the graph", s.ctx.memory.stats().entities >= 118);
} finally { await s.stop(); }

// Kobo disabled without a token
const s2 = await startServer({ port: 0, ephemeral: true, password: "", koboToken: "", hasKey: false });
try {
  check("Kobo routes are disabled when no token is configured", (await fetch(`http://127.0.0.1:${s2.port}/kobo/api/v2/kpis`)).status === 404);
  check("no password configured means open (local dev)", (await fetch(`http://127.0.0.1:${s2.port}/api/meta`)).status === 200);
} finally { await s2.stop(); }
console.log(`\n${total - failed}/${total} deploy checks passed`);
process.exit(failed ? 1 : 0);
