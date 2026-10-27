// Tests the Zetaris read adapter against a mock of Zetaris's documented REST API. No Zetaris, no database, no network.
// Run: npm run zetaris-test
import http from "node:http";

process.env.DATA_MODE = "zetaris";
process.env.ZETARIS_DATASOURCE = "ctxpg";
process.env.ZETARIS_API_KEY = "test-zetaris-key";
process.env.ZETARIS_ORG_ID = "1";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); if (!ok) failures++; };

let active = 0, maxActive = 0;
const seen: { sql: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
let failNext = false;
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const body = JSON.parse(raw) as { sql: string } & Record<string, unknown>;
    seen.push({ sql: body.sql, headers: req.headers, body });
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 60));
    active--;
    if (failNext) { failNext = false; res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"msg":"Not Allowed"}'); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    if (body.sql.includes("ctxpg.meta")) return void res.end(JSON.stringify({ headers: ["value"], data: [["2026-07-06"]], total: 1, timeUsed: 5 }));
    if (body.sql.includes("ctxpg.v_project_health")) return void res.end(JSON.stringify({ headers: ["project_id", "name", "utilization_pct", "late_activities", "burn_delivery_gap_pts", "is_active", "note"], data: [["pr1", "Turkana Water Access Programme", "81.0", "1", "7", "true", null]], total: 1, timeUsed: 9 }));
    res.end(JSON.stringify({ headers: ["x"], data: [["1"]], total: 1, timeUsed: 1 }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
process.env.ZETARIS_REST_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1.0`;

const { ZetarisDataPort, coerce } = await import("../src/adapters/zetaris.ts");
const { T } = await import("../src/tools/sql.ts");
const { runTool } = await import("../src/tools/index.ts");

check("tables are addressed as <datasource>.<table> in Zetaris mode", T.ops("projects") === "ctxpg.projects" && T.docs("document_chunks") === "ctxpg.document_chunks" && T.kobo("kobo_submissions") === "ctxpg.kobo_submissions");
check("text values get their real types", coerce("81") === 81 && coerce("74.1") === 74.1 && coerce("true") === true && coerce("pr1") === "pr1" && coerce("2026-06-24") === "2026-06-24" && coerce("doc-003#1") === "doc-003#1" && coerce(null) === null);

const port = new ZetarisDataPort();
const asOf = (await port.query(`SELECT value FROM ${T.ops("meta")} WHERE key = 'as_of_date'`))[0].value;
check("the as-of date is read through Zetaris", asOf === "2026-07-06", String(asOf));
const h = seen[0].headers;
check("every request sends the bearer key, the organisation id and a fresh uuid", h.authorization === "Bearer test-zetaris-key" && h["x-org-id"] === "1" && /^[0-9a-f-]{36}$/.test(String(h["x-request-id"])) && /^[0-9a-f-]{36}$/.test(String(seen[0].body.queryId)) && seen[0].body.source === "SqlEditor");

const ctx = { data: port, writer: {} as never, memory: {} as never, asOf: "2026-07-06", dryRun: false, actor: "t", findingIds: [] } as unknown as import("../src/tools/index.ts").ToolContext;
const r = await runTool("project_health", {}, ctx);
const row = (r.rows ?? [])[0] as Record<string, unknown>;
check("a real tool runs through Zetaris and returns typed rows", seen.some((s) => s.sql.includes("FROM ctxpg.v_project_health")) && row.utilization_pct === 81 && row.is_active === true && row.note === null && row.project_id === "pr1", JSON.stringify(row));

maxActive = 0;
await Promise.all(Array.from({ length: 8 }, (_, i) => port.query(`SELECT ${i} FROM ctxpg.projects`)));
check("at most two statements run at once", maxActive <= 2, `max ${maxActive}`);

failNext = true;
let msg = "";
try { await port.query("SELECT 1 FROM ctxpg.projects"); } catch (e) { msg = (e as Error).message; }
check("an error names the HTTP status and never contains the key", /Zetaris HTTP 400/.test(msg) && !msg.includes("test-zetaris-key"), msg);

server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall zetaris checks passed");
process.exit(failures ? 1 : 0);
