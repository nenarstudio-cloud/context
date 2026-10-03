// REPLAY MODE: a deterministic stand-in for the model, for development and offline demos.
// It runs the same tools, in the same parallel batches, with the same events as the live agent,
// then composes the answer from the retrieved rows with templates. It is NOT reasoning, and the UI
// labels it as such. It only understands the golden questions.
import { runTool, type ToolContext } from "../tools/index.ts";
import { summarize, type AgentEvent } from "./investigate.ts";

type Rows = any[];
type R = { rows?: Rows; refs: string[]; [k: string]: unknown };
const SUPPORTED = [
  "Why is Turkana Water Access at risk of missing its Q3 milestone?",
  "Why is Garissa Maternal Health burning budget faster than it delivers?",
  "What should we change before submitting the Nairobi Civic Tech Lab closeout report?",
  "Is the organisation about to overspend, and what policy gap contributes?",
];
export const replaySupported = SUPPORTED;

function route(q: string): number {
  const s = q.toLowerCase();
  if (/turkana/.test(s) && /(water|milestone|risk|q3)/.test(s)) return 0;
  if (/garissa/.test(s) && /(maternal|burn|deliver|budget)/.test(s)) return 1;
  if (/(nairobi|civic)/.test(s)) return 2;
  if (/(overspend|travel|policy)/.test(s)) return 3;
  return -1;
}

const sentences = (t: string, n: number) => (t.match(/[^.]+\.(\s|$)/g) ?? [t]).slice(0, n).join("").trim();
const find = (rows: Rows, re: RegExp) => rows.find((r) => new RegExp(re.source, "i").test(String(r.text)));
const cite = (r: { chunk_id?: string } | undefined) => (r?.chunk_id ? `[${r.chunk_id}]` : "");

export async function replayInvestigate(question: string, ctx: ToolContext, onEvent: (e: AgentEvent) => void): Promise<{ answer: string }> {
  const idx = route(question);
  if (idx < 0) {
    const text = `Replay mode has no model, so it only understands these questions:\n${SUPPORTED.map((q, i) => `${i + 1}. ${q}`).join("\n")}\nSet ANTHROPIC_API_KEY on the server for live mode.`;
    onEvent({ type: "answer", text }); return { answer: text };
  }
  let n = 0;
  const call = async (name: string, args: Record<string, unknown>): Promise<R> => {
    const id = `rp${++n}`;
    onEvent({ type: "tool", id, name, args, status: "running" });
    const r = (await runTool(name, args, ctx)) as R;
    onEvent({ type: "tool", id, name, args, status: "ok", summary: summarize(r), refs: r.refs.slice(0, 12) });
    return r;
  };
  const batch = (calls: [string, Record<string, unknown>][]) => Promise.all(calls.map(([a, b]) => call(a, b)));
  const record = (project_id: string, statement: string, evidence_refs: string[], confidence: number) => call("record_finding", { project_id, statement, evidence_refs, confidence });
  const propose = (project_id: string, title: string, rationale: string, evidence_refs: string[]) => call("propose_decision", { project_id, title, rationale, evidence_refs });
  let answer = "";

  if (idx === 0) {
    const [h, proc, vac, con, dl, kpi, ev1, ev2, mem] = await batch([
      ["project_health", { project_id: "pr1" }], ["pending_procurement", { project_id: "pr1" }], ["open_vacancies", { project_id: "pr1" }],
      ["contract_expiry", { within_days: 30 }], ["upcoming_deadlines", { project_id: "pr1" }], ["kpi_series", { kpi_id: "K1", wards: "BREAKDOWN", since: "2026-06-01" }],
      ["search_evidence", { project_id: "pr1", terms: ["rain", "standing water", "delay", "notify", "warn"], limit: 15 }],
      ["search_evidence", { project_id: "pr1", terms: ["contract", "vacancy", "milestone", "spares"] }],
      ["recall_memory", { query: "seasonal slip long rains notify donor before milestone" }],
    ]);
    const ev = [...(ev1.rows ?? []), ...(ev2.rows ?? [])];
    const hh = h.rows![0], pq = proc.rows![0], vv = vac.rows![0];
    const jm = con.rows!.find((r) => r.full_name === "Joseph Mutua"), ms = dl.rows!.find((r) => /Q3 milestone/.test(String(r.title)));
    const low = [...kpi.rows!].sort((a, b) => a.value - b.value)[0];
    const site = ev.find((r) => r.doc_type === "site_visit_note" && /standing water/i.test(String(r.text))), y25 = find(ev, /did not warn/), spares = find(ev, /signed the contract|signed contract/);
    const lesson = mem.rows!.find((m) => /pre-notified/.test(String(m.content)));
    const rEv = ["ops.v_project_health:pr1", site?.chunk_id, `kobo.kpi:K1`, "ops.v_pending_procurement:pq01", "ops.v_open_vacancies:v01", "ops.v_contract_expiry:p8"].filter(Boolean) as string[];
    await record("pr1", "The long-rains drilling slip seen in 2024 and 2025 is recurring: standing water has stopped the rig at Lokichar sites.", [site?.chunk_id, "doc-001#1", "doc-002#1"].filter(Boolean) as string[], 0.85);
    await record("pr1", `Two internal blockers compound it: rig spares contract unsigned ${pq.days_pending} days, and the ${vv.role} post vacant ${vv.days_open} days with no interim sign-off.`, [spares?.chunk_id, "ops.v_pending_procurement:pq01", "ops.v_open_vacancies:v01"].filter(Boolean) as string[], 0.8);
    await propose("pr1", "Pre-notify Global Resilience Fund of a likely 6 week slip before the 20 July check-in", "The 2024 pre-notification preserved the donor relationship; the 2025 late warning led to monthly reporting.", [site?.chunk_id, lesson?.refs?.[0], y25?.chunk_id].filter(Boolean) as string[]);
    await propose("pr1", `Approve the rig spares contract with ${pq.supplier} (USD ${Number(pq.amount_usd).toLocaleString("en-US")}, needs Executive Director approval)`, "Drilling cannot restart without the spares; the request has been pending since the middle of June.", ["ops.v_pending_procurement:pq01", spares?.chunk_id].filter(Boolean) as string[]);
    await propose("pr1", "Extend Joseph Mutua's contract and approve Samuel Kiptoo as interim technical sign-off", "His contract ends in 11 days and he serves both Turkana projects; Phase 3b drilling starts 3 August and needs technical sign-off.", ["ops.v_contract_expiry:p8", "ops.v_open_vacancies:v01"]);
    answer = `Answer: Turkana Water Access is likely to miss its ${ms?.due_date} milestone (${ms?.days_left} days away, status ${ms?.status}). The seasonal long-rains slip that hit drilling in 2024 and 2025 is recurring, and two internal blockers make it worse.

Evidence:
- Money is ahead of plan: ${hh.utilization_pct}% spent against ${hh.planned_utilization_pct}% planned, with ${hh.late_activities} late activity. [ops.v_project_health:pr1]
- In the field: ${sentences(String(site?.text), 2)} ${cite(site)}
- Borehole functionality is lowest in ${low.ward} at ${low.value}% against a ${low.target}% target. [kobo.kpi:K1]
- Rig spares request (${pq.supplier}) has been pending ${pq.days_pending} days. ${spares ? sentences(String(spares.text), 2) : ""} [ops.v_pending_procurement:pq01]${cite(spares)}
- ${vv.role} post vacant ${vv.days_open} days, stage ${vv.stage}, no interim cover. [ops.v_open_vacancies:v01]
- ${jm?.full_name}'s contract ends in ${jm?.days_left} days and he serves: ${jm?.projects}. [ops.v_contract_expiry:p8]

Pattern: ${lesson ? sentences(String(lesson.content).replace(/^[^:]+: /, ""), 2) : "No precedent found."} [${lesson?.refs?.[0]}] ${y25 ? `The 2025 case: ${sentences(String(y25.text), 2)} ${cite(y25)}` : ""}

Recommended actions (stored as pending decisions for a human to approve):
1. Pre-notify Global Resilience Fund before the 20 July check-in.
2. Approve the rig spares contract.
3. Extend Joseph Mutua and approve interim technical sign-off.

Confidence and gaps: high on cause (three independent sources agree). The 6 week slip is the site visitor's estimate, and there is no weather forecast data. (Replay mode: composed from templates, not model reasoning.)`;
  } else if (idx === 1) {
    const [h, lines, k7, ev, mem] = await batch([
      ["project_health", { project_id: "pr4" }], ["budget_by_line", { project_id: "pr4" }], ["kpi_series", { kpi_id: "K7", wards: "BREAKDOWN", since: "2026-03-01" }],
      ["search_evidence", { project_id: "pr4", terms: ["stock-out", "travel", "extension", "reallocat"] }], ["recall_memory", { query: "budget burn ahead of delivery no-cost extension" }],
    ]);
    const p = h.rows![0], tr = lines.rows!.find((r) => r.category === "Travel");
    const stock = find(ev.rows!, /stock-outs/), fin = find(ev.rows!, /burn-rate|travel line/i), mins = find(ev.rows!, /extension/);
    const pilot = mem.rows!.find((m) => (m.refs as string[]).some((x) => x.startsWith("doc-011")));
    await record("pr4", `Garissa has spent ${p.utilization_pct}% of budget for ${p.delivery_pct}% delivery (gap ${p.burn_delivery_gap_pts} points), driven by the travel line at ${Math.round(tr.line_utilization_pct)}%.`, ["ops.v_project_health:pr4", "ops.v_budget_by_line:pr4", fin?.chunk_id].filter(Boolean) as string[], 0.9);
    await record("pr4", "Clinic days cancelled by consumable stock-outs kept travel costs running while attendance fell.", [stock?.chunk_id, "kobo.kpi:K7"].filter(Boolean) as string[], 0.75);
    await propose("pr4", "Request a no-cost extension to 31 December 2026 and the USD 18,000 reallocation now", `The burn-delivery gap is ${p.burn_delivery_gap_pts} points. The 2024 pilot shows early requests are approved and late ones refused.`, [pilot?.refs?.[0], mins?.chunk_id, "ops.v_project_health:pr4"].filter(Boolean) as string[]);
    const fafi = (k7.rows as Rows).filter((r) => r.ward === "Fafi").sort((a, b) => String(a.period_month).localeCompare(String(b.period_month)));
    answer = `Answer: Garissa Maternal Health is spending ${p.burn_delivery_gap_pts} points faster than it delivers (${p.utilization_pct}% of budget used, ${p.delivery_pct}% of the workplan done), mainly through mobile clinic travel costs that continued while clinics were cancelled by stock-outs.

Evidence:
- ${p.utilization_pct}% spent vs ${p.delivery_pct}% delivered, USD ${Number(p.remaining_usd).toLocaleString("en-US")} left. [ops.v_project_health:pr4]
- Travel is at ${Math.round(tr.line_utilization_pct)}% of its budget, the most overspent line. [ops.v_budget_by_line:pr4]
- ${sentences(String(stock?.text), 2)} ${cite(stock)}
- Fafi attendance fell to ${Math.round(fafi[fafi.length - 2]?.value)} in May from ${Math.round(fafi[0]?.value)} in March. [kobo.kpi:K7]
- ${sentences(String(mins?.text), 2)} ${cite(mins)}

Pattern: ${pilot ? sentences(String(pilot.content).replace(/^[^:]+: /, ""), 2) : "No precedent found."} [${pilot?.refs?.[0]}]

Recommended actions (pending decision): request the no-cost extension and reallocation now, before the donor forces the conversation.

Confidence and gaps: high on the burn gap (direct from data), medium on cause. (Replay mode: composed from templates, not model reasoning.)`;
  } else if (idx === 2) {
    const [nm, ev, k6, mem] = await batch([
      ["projects_without_maintenance", {}], ["search_evidence", { project_id: "pr5", terms: ["maintenance", "sustainability"] }],
      ["kpi_series", { kpi_id: "K6", since: "2025-11-01" }], ["recall_memory", { query: "open data portal decay maintenance budget line" }],
    ]);
    const lesson = find(ev.rows!, /decay without recurring maintenance/), draft = find(ev.rows!, /does not identify a maintenance/), eu = find(ev.rows!, /costed budget/);
    const u = k6.rows!;
    await record("pr5", "The closeout draft has no maintenance budget line and no costed sustainability plan, which the EU requires by 31 July.", [draft?.chunk_id, eu?.chunk_id, "ops.v_projects_without_maintenance:pr5"].filter(Boolean) as string[], 0.9);
    await propose("pr5", "Add a costed annual maintenance line (8 to 10% of build cost) and sustainability plan to the closeout report", "The project's own lesson warns that portals decay without maintenance, and the EU requires a costed plan.", [lesson?.chunk_id, eu?.chunk_id].filter(Boolean) as string[]);
    answer = `Answer: Before submitting, add a costed maintenance line and sustainability plan. The draft has neither, the EU requires both by 31 July, and the project's own lesson predicts what happens without them.

Evidence:
- Nairobi Civic Tech Lab has no Maintenance budget line. [ops.v_projects_without_maintenance:pr5]
- ${sentences(String(draft?.text), 1)} ${cite(draft)}
- ${sentences(String(eu?.text), 1)} ${cite(eu)}
- Portal users fell from ${u[0].value} to ${u[u.length - 1].value} (target 5,000). [kobo.kpi:K6]

Pattern: ${sentences(String(lesson?.text), 2)} ${cite(lesson)}

Recommended actions (pending decision): add the maintenance line and plan to the closeout report.

Confidence and gaps: high. (Replay mode: composed from templates, not model reasoning.)`;
  } else {
    const [tq, all, ev] = await batch([["travel_by_quarter", {}], ["project_health", {}], ["search_evidence", { terms: ["travel", "ceiling", "procurement"], doc_types: ["board_paper", "policy"] }]]);
    const q2 = tq.rows!.find((r) => r.quarter_start === "2026-04-01");
    const over = all.rows!.filter((r) => r.status !== "Closed" && r.burn_vs_plan_pts > 5);
    const board = find(ev.rows!, /travel spend rose/), pol = find(ev.rows!, /does not set a ceiling/), proc = find(ev.rows!, /escalation rule/);
    await record("pr4", `Travel spend rose ${q2?.qoq_pct}% quarter on quarter and the travel policy has no per-county ceiling.`, [board?.chunk_id, pol?.chunk_id, "ops.v_travel_by_quarter"].filter(Boolean) as string[], 0.85);
    await propose("pr4", "Adopt an interim per-county travel ceiling until the policy update is approved", "Travel is up 11% quarter on quarter and the policy sets no ceiling; the Garissa travel line is already at 125%.", [board?.chunk_id, pol?.chunk_id].filter(Boolean) as string[]);
    answer = `Answer: Yes, two projects are already above planned burn (${over.map((r) => r.name).join(" and ")}), and travel spend is rising ${q2?.qoq_pct}% quarter on quarter with no per-county ceiling in policy.

Evidence:
- Travel Q2 vs Q1 2026: +${q2?.qoq_pct}%. [ops.v_travel_by_quarter]
- ${sentences(String(pol?.text), 2)} ${cite(pol)}
- ${sentences(String(board?.text), 2)} ${cite(board)}
- ${sentences(String(proc?.text), 2)} ${cite(proc)}

Recommended actions (pending decision): adopt an interim per-county travel ceiling and add a 14 day escalation rule for unsigned supplier contracts to the procurement draft.

Confidence and gaps: high on the numbers, medium on whether a ceiling alone fixes it. (Replay mode: composed from templates, not model reasoning.)`;
  }
  onEvent({ type: "answer", text: answer });
  return { answer };
}
