// Offline evaluation of the whole tool and context layer against the golden questions.
// No LLM is called: each question runs a fixed plan of tool calls (what a good agent should do) and
// asserts that the evidence, numbers, memory recall and evidence graph come out right.
// Requires the local Postgres loaded with sql/01..05.   Run: npm run eval
import { createRuntime, seed } from "../src/runtime.ts";
import { runTool, type ToolContext } from "../src/tools/index.ts";

let failed = 0, total = 0;
const check = (name: string, ok: boolean, detail = "") => { total++; if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); };
const par = (ctx: ToolContext, calls: [string, Record<string, unknown>][]) => Promise.all(calls.map(([n, a]) => runTool(n, a, ctx)));
const ids = (rows: any[]) => new Set(rows.map((r) => String(r.chunk_id).split("#")[0]));
const num = (v: unknown) => Number(v);

const { ctx, close } = await createRuntime({ ephemeral: true, actor: "context-agent-eval" });
try {
  console.log("seed:", JSON.stringify(await seed(ctx)));
  check("as-of date comes from ops.meta", ctx.asOf === "2026-07-06", ctx.asOf);

  // ---------------- Q1: Turkana Water
  console.log("\nQ1 Why is Turkana Water at risk of missing Q3?");
  const [health, proc, vac, contracts, dls, kpi, ev1, ev2, mem] = await par(ctx, [
    ["project_health", { project_id: "pr1" }], ["pending_procurement", { project_id: "pr1" }], ["open_vacancies", { project_id: "pr1" }],
    ["contract_expiry", { within_days: 30 }], ["upcoming_deadlines", { project_id: "pr1" }],
    ["kpi_series", { kpi_id: "K1", wards: "BREAKDOWN", since: "2026-06-01" }],
    ["search_evidence", { project_id: "pr1", terms: ["rain", "standing water", "delay", "notify"] }],
    ["search_evidence", { project_id: "pr1", terms: ["contract", "vacancy", "milestone", "spares"] }],
    ["recall_memory", { query: "seasonal slip long rains notify donor before milestone" }],
  ]);
  const h = health.rows![0] as any;
  check("utilization 81 vs plan 72", num(h.utilization_pct) === 81 && num(h.planned_utilization_pct) === 72, `${h.utilization_pct}/${h.planned_utilization_pct}`);
  check("late activity flagged on pr1", num(h.late_activities) >= 1, String(h.late_activities));
  check("rig spares pending 16 days", num((proc.rows![0] as any).days_pending) === 16);
  check("senior WASH vacancy 35 days, no interim cover", num((vac.rows![0] as any).days_open) === 35 && (vac.rows![0] as any).interim_cover == null);
  const jm = (contracts.rows as any[]).find((r) => r.full_name === "Joseph Mutua");
  check("Joseph Mutua contract ends in 11 days, serves both Turkana projects", !!jm && num(jm.days_left) === 11 && /Turkana Water/.test(jm.projects) && /Pastoralist/.test(jm.projects));
  check("Q3 milestone deadline visible", (dls.rows as any[]).some((r) => /Q3 milestone/.test(r.title) && r.status === "At risk"));
  const lowest = [...(kpi.rows as any[])].sort((a, b) => num(a.value) - num(b.value))[0];
  check("lowest borehole functionality ward is Lokichar, below 90 target", lowest.ward === "Lokichar" && num(lowest.value) < num(lowest.target), `${lowest.ward} ${lowest.value}`);
  const found = new Set([...ids(ev1.rows as any[]), ...ids(ev2.rows as any[])]);
  for (const d of ["doc-001", "doc-002", "doc-003", "doc-005", "doc-007", "doc-008"]) check(`evidence found ${d}`, found.has(d));
  check("no distractor evidence for pr1 (doc-024, doc-025)", !found.has("doc-024") && !found.has("doc-025"));
  const recalled = (mem.rows as any[]);
  check("H-MEM recalls the 2024 pre-notification lesson", recalled.some((m) => /pre-notified Global Resilience Fund/.test(m.content)), recalled.map((m) => m.refs[0]).join(","));
  check("recall carries provenance refs (documents or recorded human decisions)", recalled.every((m) => m.refs.length > 0 && ["document", "manual"].includes(m.origin)));
  check("a past leadership decision is recalled as precedent", recalled.some((m) => m.origin === "manual" && /Leadership approved/.test(m.content)));

  // record findings, propose a decision, check the graph and the write path
  const refs1 = ["doc-003#1", "ops.v_pending_procurement:pq01", "ops.v_open_vacancies:v01"];
  const f1 = await runTool("record_finding", { project_id: "pr1", statement: "Long-rains standing water has stopped drilling at 3 of 5 Lokichar sites, repeating the 2024 and 2025 seasonal slips.", evidence_refs: ["doc-001#1", "doc-002#1", "doc-003#1"], confidence: 0.85 }, ctx);
  await runTool("record_finding", { project_id: "pr1", statement: "Rig spares contract unsigned for 16 days and no interim technical sign-off while the Senior WASH Engineer post is vacant.", evidence_refs: refs1, confidence: 0.8 }, ctx);
  const dec = await runTool("propose_decision", { project_id: "pr1", title: "Pre-notify Global Resilience Fund of a likely 6 week slip before the 20 July check-in", rationale: "2024 pre-notification preserved the relationship; the 2025 late warning strained it.", evidence_refs: ["doc-001#3", "doc-002#2", "doc-008#2"] }, ctx);
  check("decision stored as Pending", dec.status === "Pending");
  const rows = await ctx.data.query(`SELECT status, created_at, created_by FROM ops.decisions WHERE decision_id = '${dec.decision_id}'`);
  check("decision row written with as-of date, not system clock", rows[0]?.status === "Pending" && rows[0]?.created_at === "2026-07-06");
  const g = ctx.memory.neighborhood("project:ops:pr1", 3);
  const types = new Set(g.nodes.map((n) => n.type));
  check("graph links project, findings, documents, decision, donor, people", ["project", "finding", "document", "decision", "donor", "person"].every((t) => types.has(t)), [...types].join(","));
  check("finding is evidenced-by a document", g.edges.some((e) => e.type === "evidenced-by" && e.to.startsWith("document:docs:doc-00")));
  const audit = ctx.memory.audit(f1.memory_id as string);
  check("trust ledger has an audit trail for the finding", Array.isArray(audit) && audit.length >= 1);

  // ---------------- Q2: Garissa
  console.log("\nQ2 Why is Garissa Maternal Health burning faster than it delivers?");
  const [h4, lines4, k7, ev4, mem4] = await par(ctx, [
    ["project_health", { project_id: "pr4" }], ["budget_by_line", { project_id: "pr4" }],
    ["kpi_series", { kpi_id: "K7", wards: "BREAKDOWN", since: "2026-03-01" }],
    ["search_evidence", { project_id: "pr4", terms: ["stock-out", "travel", "extension", "reallocat"] }],
    ["recall_memory", { query: "budget burn ahead of delivery no-cost extension" }],
  ]);
  const p4 = h4.rows![0] as any;
  check("93% spent vs 61% delivered, gap 32", num(p4.utilization_pct) === 93 && num(p4.delivery_pct) === 61 && num(p4.burn_delivery_gap_pts) === 32);
  const travel = (lines4.rows as any[]).find((r) => r.category === "Travel");
  check("Travel line is the most overspent (125%)", (lines4.rows as any[])[0].category === "Travel" && Math.round(num(travel.line_utilization_pct)) === 125);
  const fafi = (k7.rows as any[]).filter((r) => r.ward === "Fafi");
  check("Fafi attendance dips in Apr and May 2026", num(fafi.find((r) => r.period_month === "2026-05-01").value) < 0.7 * num(fafi.find((r) => r.period_month === "2026-03-01").value));
  const f4 = ids(ev4.rows as any[]);
  for (const d of ["doc-009", "doc-010", "doc-013"]) check(`evidence found ${d}`, f4.has(d));
  check("H-MEM surfaces the 2024 pilot (doc-011) as precedent", (mem4.rows as any[]).some((m) => m.refs.some((r: string) => r.startsWith("doc-011"))));

  // ---------------- Q3: Nairobi
  console.log("\nQ3 Nairobi Civic Tech Lab closeout");
  const [nm, ev5, k6] = await par(ctx, [
    ["projects_without_maintenance", {}], ["search_evidence", { project_id: "pr5", terms: ["maintenance", "sustainability"] }],
    ["kpi_series", { kpi_id: "K6", since: "2025-11-01" }],
  ]);
  check("pr5 has no maintenance line", (nm.rows as any[]).some((r) => r.project_id === "pr5"));
  const f5 = ids(ev5.rows as any[]);
  for (const d of ["doc-014", "doc-015", "doc-016"]) check(`evidence found ${d}`, f5.has(d));
  const u = (k6.rows as any[]); check("portal users fell from 4,300 to 3,100", num(u.find((r) => r.period_month === "2025-11-01").value) === 4300 && num(u[u.length - 1].value) === 3100);

  // ---------------- Q5: org wide
  console.log("\nQ5 Org-wide overspend and policy gap");
  const [tq, all, ev6] = await par(ctx, [["travel_by_quarter", {}], ["project_health", {}], ["search_evidence", { terms: ["travel", "ceiling", "procurement"], doc_types: ["board_paper", "policy"] }]]);
  const q2 = (tq.rows as any[]).find((r) => r.quarter_start === "2026-04-01");
  check("travel Q2 vs Q1 2026 is +11%", Math.abs(num(q2.qoq_pct) - 11) <= 0.3, String(q2.qoq_pct));
  const over = (all.rows as any[]).filter((r) => r.status !== "Closed" && num(r.burn_vs_plan_pts) > 5).map((r) => r.project_id).sort();
  check("exactly pr1 and pr4 above planned burn", over.join() === "pr1,pr4", over.join());
  const f6 = ids(ev6.rows as any[]);
  for (const d of ["doc-020", "doc-021", "doc-022"]) check(`evidence found ${d}`, f6.has(d));

  // ---------------- Q7: distractors and safety
  console.log("\nQ7 Distractors and input safety");
  const open = await runTool("search_evidence", { terms: ["standing water"] }, ctx);
  const sw = open.rows as any[];
  check("unfiltered search returns doc-025 but labels its project (Kilifi, not Turkana)", sw.some((r) => r.chunk_id.startsWith("doc-025") && r.project_id === "pr3" && /Coastal/.test(r.project_name)));
  const scoped = await runTool("search_evidence", { project_id: "pr1", terms: ["standing water", "kakuma"] }, ctx);
  check("project-scoped search excludes Kakuma and Mtwapa notes", !ids(scoped.rows as any[]).has("doc-024") && !ids(scoped.rows as any[]).has("doc-025"));
  let blocked = 0;
  for (const bad of ["pr1'; DROP TABLE ops.projects;--", "pr1 OR 1=1", "../etc"]) { try { await runTool("project_health", { project_id: bad }, ctx); } catch { blocked++; } }
  check("malformed project ids are rejected before SQL", blocked === 3);
  const inj = await runTool("search_evidence", { terms: ["x' OR '1'='1", "rain"] }, ctx);
  check("quotes in search terms are neutralised", Array.isArray(inj.rows));
  check("projects table intact after injection attempts", num((await ctx.data.query("SELECT count(*) AS n FROM ops.projects"))[0].n) === 9);
} finally {
  const n = await (ctx.writer as any).deleteByCreator("context-agent-eval");
  console.log(`\ncleanup: removed ${n} eval decision(s)`);
  await close();
}
console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
