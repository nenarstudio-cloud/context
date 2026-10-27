// Tests the Planner / Investigator / Evaluator / Reporter pipeline end to end with a scripted mock model
// and a fake data layer. No database, no API key, no network. Run: npm run team-test
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-team-"));
process.env.CONTEXT_STATE_DIR = stateDir;
process.env.MODEL_API_KEY = "test-key-should-never-appear-in-traces";
process.env.NEMOTRON_MODEL = "mock/main-model";
process.env.NEMOTRON_FAST_MODEL = "mock/fast-model";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); if (!ok) failures++; };

// ---------- scripted mock model ----------
type Msg = { role: string; content: string | null; tool_calls?: unknown[] };
let mode: "normal" | "down" = "normal";
let slowRevision = false;
let bareReporter = false;
let evaluatorCalls = 0;
const seen: string[] = [];
const J = (o: unknown) => JSON.stringify(o);
const toolCall = (id: string, name: string, args: unknown) => ({ id, type: "function", function: { name, arguments: J(args) } });

function reply(messages: Msg[], model: string): Record<string, unknown> {
  const sys = String(messages[0]?.content ?? "");
  const role = /ROLE: (\w+)/.exec(sys)?.[1] ?? "?";
  const user = String(messages.find((m) => m.role === "user")?.content ?? "");
  const hasTools = messages.some((m) => m.role === "tool");
  seen.push(`${role}@${model}`);
  const msg = (content: string | null, tool_calls?: unknown[]) => ({ choices: [{ message: { role: "assistant", content, reasoning_content: `mock reasoning from ${role}`, ...(tool_calls ? { tool_calls } : {}) } }] });

  if (role === "PLANNER") return msg(J({ approach: "Check ops data and documents, then precedent.", project_ids: ["pr1"], sub_questions: [{ question: "Why is Turkana drilling blocked? Check procurement and the site visit documents.", focus: "ops" }, { question: "What happened in earlier phases and what did leadership decide?", focus: "memory" }] }));

  if (role === "INVESTIGATOR") {
    if (user.includes("The Evaluator rejected")) {
      return msg(J({ findings: [
        { project_id: "pr1", statement: "A Kilifi field note shows standing water delayed drilling there too, a precedent for seasonal delay.", kind: "precedent", evidence_refs: ["doc-025#1"], confidence: 0.7 },
      ], gaps: [] }));
    }
    if (user.includes("Your sub question: Why is Turkana drilling blocked")) {
      if (!hasTools) return msg(null, [toolCall("c1", "pending_procurement", { project_id: "pr1" }), toolCall("c2", "search_evidence", { terms: ["rig spares", "standing water"] })]);
      return msg(J({ findings: [
        { project_id: "pr1", statement: "Rig spares worth $86K have been pending 16 days, blocking drilling.", kind: "fact", evidence_refs: ["ops.v_pending_procurement:pq01", "doc-003#3"], confidence: 0.9 },
        { project_id: "pr1", statement: "The Senior WASH Engineer vacancy has drawn 23 applicants.", kind: "fact", evidence_refs: ["doc-003#3"], confidence: 0.7 },
        { project_id: "pr1", statement: "Standing water blocked the Kilifi sites for weeks.", kind: "fact", evidence_refs: ["doc-025#1"], confidence: 0.6 },
        { project_id: "pr1", statement: "A source that was never retrieved says the donor is angry.", kind: "fact", evidence_refs: ["doc-777#1"], confidence: 0.5 },
      ], gaps: ["Ward level drilling progress is not in the data."] }));
    }
    if (!hasTools) return msg(null, [toolCall("c1", "recall_memory", { query: "donor pre-notification delay" })]);
    return msg(J({ findings: [{ project_id: "pr1", statement: "In Phase 1 the team pre-notified the donor and the revised date was accepted without penalty.", kind: "precedent", evidence_refs: ["doc-001#3"], confidence: 0.8 }], gaps: [] }));
  }

  if (role === "EVALUATOR") {
    const isRetry = messages.some((m) => m.role === "user" && String(m.content).startsWith("Reply now with ONLY"));
    if (!isRetry) evaluatorCalls++;
    // The first reply is empty (a reasoning model that used up its token budget); the retry carries the verdict.
    if (evaluatorCalls === 1 && !isRetry) return msg("");
    return msg(J({ verdict: "revise", summary: "Two findings are not supported.", issues: [{ finding_index: 1, problem: "The applicant count is not in the cited paragraph." }, { finding_index: -1, problem: "The set does not say who approves the spend." }] }));
  }

  if (role === "REPORTER" && bareReporter) {
    // a badly formatted reply: empty actions, no precedent, empty confidence
    return msg(["Answer: Drilling is blocked by pending rig spares [ops.v_pending_procurement:pq01].", "", "Evidence:", "- Spares pending 16 days [ops.v_pending_procurement:pq01].", "", "Pattern: No precedent found.", "", "Recommended actions:", "", "Confidence and gaps:", '<decision>{"project_id":"pr1","title":"Expedite drilling rig spares procurement","rationale":"Drilling cannot restart without the spares.","evidence_refs":["ops.v_pending_procurement:pq01"]}</decision>'].join("\n"));
  }
  if (role === "REPORTER") {
    return msg([
      "Answer: Drilling is blocked because rig spares worth $86K have been pending for 16 days [doc-003#3][ops.v_pending_procurement:pq01][doc-999#1].",
      "",
      "Evidence:",
      "- Rig spares pending 16 days [ops.v_pending_procurement:pq01] (caveat: evidence truncated).",
      "",
      "Pattern: No precedent found.",
      "",
      "Recommended actions:",
      "1. Expedite the rig spares contract; owner: Procurement Lead; date: 2026-07-08.",
      "",
      "Confidence and gaps: High on the cause.",
      '<decision>{"project_id":"pr1","title":"Expedite drilling rig spares procurement","rationale":"Drilling cannot restart without the spares.","evidence_refs":["ops.v_pending_procurement:pq01","doc-555#1"]}</decision>',
      '<decision>{"project_id":"pr1","title":"Pre-notify the donor of a likely slip","rationale":"Phase 1 shows early notice is accepted.","evidence_refs":["nonexistent"]}</decision>',
    ].join("\n"));
  }
  return msg("unexpected role");
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    if (mode === "down") { res.writeHead(503); res.end("down"); return; }
    const j = JSON.parse(body) as { messages: Msg[]; model: string };
    if (slowRevision && body.includes("The Evaluator rejected")) await new Promise((r) => setTimeout(r, 10000));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(reply(j.messages, j.model)));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
process.env.MODEL_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;

// ---------- fake data layer, memory and writer ----------
const rowsFor = (sql: string) => {
  if (sql.includes("v_project_health")) return [{ project_id: "pr1", name: "Turkana Water Access Programme", utilization_pct: 81, plan_pct: 72, delivery_pct: 74, burn_delivery_gap_pts: 7 }, { project_id: "pr9", name: "Kilifi Coastal Wells", utilization_pct: 50, plan_pct: 50, delivery_pct: 50, burn_delivery_gap_pts: 0 }];
  if (sql.includes("v_pending_procurement")) return [{ request_id: "pq01", project_id: "pr1", item: "Drilling rig spares and service kit", amount_usd: 86000, days_pending: 16, status: "Pending supplier contract" }];
  if (sql.includes("document_chunks")) return [
    { chunk_id: "doc-003#3", title: "Site visit note", doc_type: "site_visit_note", created_on: "2026-06-24", project_id: "pr1", project_name: "Turkana", text: "Drilling rig spares requested on 20 June are still outstanding. Drilling cannot restart without them.", hits: 2 },
    { chunk_id: "doc-025#1", title: "Kilifi field note", doc_type: "field_note", created_on: "2026-05-02", project_id: "pr9", project_name: "Kilifi", text: "Standing water delayed drilling at the Kilifi sites by 4 weeks.", hits: 1 },
  ];
  return [];
};
const proposed: Record<string, unknown>[] = [];
const remembered: Record<string, unknown>[] = [];
const { runTeam } = await import("../src/agent/orchestrator.ts");
const { readTrace } = await import("../src/agent/trace.ts");
const { statementNumbers, unsupportedNumbers } = await import("../src/agent/evidence.ts");
const { sanitizeCitations, ensureSections } = await import("../src/agent/roles/reporter.ts");
const { extractJson } = await import("../src/agent/llm.ts");
const ctx = {
  data: { mode: "fake", query: async (sql: string) => rowsFor(sql) },
  writer: {
    propose: async (i: Record<string, unknown>) => { proposed.push(i); return { decisionId: `dec-test-${proposed.length}` }; },
    deleteByCreator: async () => 0, decide: async () => null,
    list: async () => proposed.map((p, k) => ({ decision_id: `dec-test-${k + 1}`, project_id: p.projectId, title: p.title, status: "Pending" })),
  },
  memory: {
    recall: () => [{ id: "mem-x1", content: "Phase 1: the team pre-notified the donor in March 2024 and the donor accepted the revised date.", relevance: 0.8, origin: "document", refs: ["doc-001#3"], confidence: 0.9 }],
    rememberFinding: async (f: Record<string, unknown>) => { remembered.push(f); return { memoryId: `mem-${remembered.length}`, entityId: `finding:${remembered.length}` }; },
    linkDecision: async () => {},
  },
  asOf: "2026-07-06", dryRun: false, actor: "context-agent", findingIds: [] as string[],
} as unknown as import("../src/tools/index.ts").ToolContext;

// ---------- unit checks ----------
check("86K matches 86000", unsupportedNumbers("$86K pending", '{"amount_usd":86000}').length === 0);
check("81% matches 81.2", unsupportedNumbers("utilization 81%", '{"u":81.2}').length === 0);
check("a made up number is flagged", unsupportedNumbers("23 applicants", '{"days_open":35}').join() === "23");
check("a difference of two cited numbers is accepted", unsupportedNumbers("a gap of 9 points", '{"a":81,"b":72}').length === 0);
check("ids, dates, years and phases are not treated as numbers", statementNumbers("Phase 2 in 2025 for pr1 [doc-003#1] on 2026-07-20 (Q3)").length === 0);
check("extractJson survives fences and think tags", (extractJson<{ a: number }>('<think>x {y}</think>```json\n{"a":1}\n```') ?? { a: 0 }).a === 1);
const san = sanitizeCitations("Fact [doc-001#1][doc-999#1] and [ops.v_x:p1, doc-001#1] and [Q3 plan].", new Set(["doc-001#1"]));
check("citations not backed by findings are removed", san.removed === 2 && san.text.includes("[doc-001#1]") && !san.text.includes("doc-999") && san.text.includes("[Q3 plan]"), san.text);

const { EvidencePool } = await import("../src/agent/evidence.ts");
const pool = new EvidencePool();
pool.add({ id: "t1", name: "project_health", args: {}, ok: true, refs: ["ops.v_project_health:pr1", "ops.v_project_health:pr9"], text: "{}", rows: rowsFor("v_project_health") });
const ex = pool.excerpt("ops.v_project_health:pr1");
check("the critic is shown the exact row behind a reference, not the whole tool result", ex.includes("Turkana") && !ex.includes("Kilifi"), ex.slice(0, 120));

const ens = ensureSections("Answer: x.\n\nPattern: No precedent found.\n\nRecommended actions:\n\nConfidence and gaps:", [{ project_id: "pr4", statement: "Travel is overspent.", kind: "fact", evidence_refs: ["ops.v_x:pr4"], confidence: 0.9 }], [], ["No ward level data."], [{ content: "In 2024 a pilot cut travel costs by moving outreach to community health workers.", refs: ["doc-011#1"] }]);
check("with no precedent finding, the Pattern line quotes retrieved organizational memory with its reference", /Pattern: Organizational memory records: In 2024 a pilot.*\[doc-011#1\]/.test(ens.text) && ens.extraRefs.includes("doc-011#1"), ens.text.replace(/\n/g, " | "));

// ---------- full run ----------
const events: { type: string; [k: string]: unknown }[] = [];
const result = await runTeam("Why is Turkana Water at risk of missing Q3?", ctx, { emit: (e) => events.push(e as never), runLimitSec: 60 });
const trace = readTrace(stateDir, result.runId) as { events: { role: string; action: string; note?: string }[]; reasoning?: unknown } | null;
const saved = fs.readFileSync(result.tracePath ?? "", "utf-8");

check("the four roles all ran", ["PLANNER", "INVESTIGATOR", "EVALUATOR", "REPORTER"].every((r) => seen.some((s) => s.startsWith(r))));
check("the planner uses the fast model, everything else the main model", seen.includes("PLANNER@mock/fast-model") && seen.includes("REPORTER@mock/main-model") && seen.includes("INVESTIGATOR@mock/main-model") && seen.includes("EVALUATOR@mock/main-model"));
check("two investigators ran for two sub questions", events.filter((e) => e.type === "role" && String(e.role).startsWith("Investigator") && e.status === "running" && !String(e.role).includes("R")).length === 2);
check("an empty reply from a reasoning model is retried with a bigger budget", (trace?.events ?? []).some((e) => e.role === "Evaluator" && e.action === "model" && /needed a retry/.test(e.note ?? "")));
check("the Evaluator sent findings back for one revision round", result.rounds === 1);
check("first code check caught the invented number, the wrong project paragraph and the unknown source", /code check found 3 issue/.test(trace?.events.find((e) => e.role === "Evaluator" && e.action === "check")?.note ?? ""), trace?.events.find((e) => e.role === "Evaluator" && e.action === "check")?.note);
check("the model critic reviews once; after the revision only the code check runs, and the run passes", result.verdict === "pass" && result.rounds === 1 && result.dropped === 0 && result.findings === 3 && evaluatorCalls === 1 && result.criticRan, JSON.stringify({ v: result.verdict, d: result.dropped, f: result.findings }));
check("only checked findings were recorded in memory", remembered.length === 3 && remembered.every((r) => !String(r.statement).includes("23 applicants") && !String(r.statement).includes("never retrieved")));
check("a Pattern line is never left saying no precedent when a checked precedent exists", !/No precedent found/i.test(result.answer));
check("inline caveats are not left inside the evidence lines", !/\(caveat:/i.test(result.answer));
check("the answer keeps backed citations and drops unbacked ones", result.answer.includes("[doc-003#3]") && !result.answer.includes("doc-999"), result.answer.split("\n")[0]);
check("an invented owner and an invented date were scrubbed from the answer", !result.answer.includes("2026-07-08") && !result.answer.includes("Procurement Lead") && result.answer.includes("date to be agreed") && result.answer.includes("owner: to be assigned"), result.answer.split("\n").find((l) => l.startsWith("1.")));
check("both decisions were stored as proposals, with only valid evidence refs", proposed.length === 2 && (proposed[0].evidenceRefs as string[]).join() === "ops.v_pending_procurement:pq01", JSON.stringify(proposed.map((p) => p.evidenceRefs)));
check("the UI got role events and tool events", events.some((e) => e.type === "role" && e.role === "Evaluator" && e.status === "ok") && events.some((e) => e.type === "tool" && e.name === "propose_decision" && e.status === "ok") && events.some((e) => e.type === "answer"));
check("the trace records what the Evaluator objected to", (trace?.events ?? []).some((e) => e.role === "Evaluator" && e.action === "issues" && /numbers do not appear/.test(e.note ?? "")));
check("the saved trace has events and keeps reasoning for debugging", saved.includes("mock reasoning from") && Array.isArray(JSON.parse(saved).events));
check("the API version of the trace has no reasoning", trace !== null && trace.reasoning === undefined);
check("no key appears in the trace", !saved.includes("test-key-should-never-appear-in-traces"));
check("a bad run id cannot read files", readTrace(stateDir, "../../etc/passwd") === null);

// ---------- time limit during revision: keep what is verified, do not throw the run away ----------
evaluatorCalls = 0; slowRevision = true; bareReporter = true; proposed.length = 0; remembered.length = 0;
const t0 = Date.now();
const late = await runTeam("Why is Turkana Water at risk of missing Q3?", ctx, { runLimitSec: 14, reserveSec: 9 });
slowRevision = false; bareReporter = false;
const lateTrace = readTrace(stateDir, late.runId) as { events: { note?: string }[] } | null;
check("a run that hits the time limit during revision still finishes with the findings that pass the code check", late.verdict === "pass-with-caveats" && late.findings === 2 && late.dropped === 3, JSON.stringify({ v: late.verdict, f: late.findings, d: late.dropped }));
check("the answer says the review was cut short", late.answer.includes("time limit"), late.answer.split("\n").pop());
check("empty sections are filled from checked material: actions from the decisions, pattern from the precedent, a confidence line", /1\. Expedite drilling rig spares procurement/.test(late.answer) && /Pattern: .*pre-notified the donor.*\[doc-001#3\]/.test(late.answer) && /Confidence and gaps: Medium|Confidence and gaps: High/.test(late.answer), late.answer.replace(/\n/g, " | ").slice(0, 400));
check("the trace records the time limit", (lateTrace?.events ?? []).some((e) => /time limit reached/.test(e.note ?? "")));
check("the late run did not exceed its limit", Date.now() - t0 < 14000, `${Date.now() - t0} ms`);

// ---------- model down: must fail cleanly so the caller can fall back ----------
mode = "down";
let failed = "";
try { await runTeam("Why is Turkana Water at risk of missing Q3?", ctx, { runLimitSec: 20 }); } catch (e) { failed = (e as Error).message; }
check("an unreachable model fails cleanly (the server then falls back to replay)", failed.length > 0 && !failed.includes("test-key"), failed);

server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall team checks passed");
process.exit(failures ? 1 : 0);
