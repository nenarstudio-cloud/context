import type { DataPort, DecisionWriter, Row } from "../ports.ts";
import type { MeterlessContext } from "../context/meterless.ts";
import { T, lit, projectId, kpiId, cleanTerm, intIn, dateStr } from "./sql.ts";

export interface ToolContext {
  data: DataPort; writer: DecisionWriter; memory: MeterlessContext;
  asOf: string; dryRun: boolean; actor: string;
  findingIds: string[];   // graph ids of findings recorded in this run (links decisions to findings)
}
export interface ToolResult { rows?: Row[]; refs: string[]; note?: string; [k: string]: unknown }
interface ToolDef {
  name: string; description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (a: Record<string, any>, c: ToolContext) => Promise<ToolResult>;
}

const refs = (view: string, rows: Row[], key: string) => rows.map((r) => `${view}:${String(r[key])}`);
const where = (conds: (string | null)[]) => { const c = conds.filter(Boolean); return c.length ? `WHERE ${c.join(" AND ")}` : ""; };
const optProject = (a: Record<string, any>) => (a.project_id ? `project_id = ${lit(projectId(a.project_id))}` : null);

export const TOOLS: ToolDef[] = [
  {
    name: "project_health",
    description: "Money and delivery health per project: utilization vs plan, delivery percent, burn-delivery gap in points, late activities, remaining budget, days to end. Omit project_id for all projects (sorted by largest gap).",
    input_schema: { type: "object", properties: { project_id: { type: "string", description: "e.g. pr1" } } },
    run: async (a, c) => {
      const rows = await c.data.query(`SELECT * FROM ${T.ops("v_project_health")} ${where([optProject(a)])} ORDER BY burn_delivery_gap_pts DESC`);
      return { rows, refs: refs("ops.v_project_health", rows, "project_id") };
    },
  },
  {
    name: "budget_by_line",
    description: "Budget vs spend per budget line (category) for one project. Shows which lines are overspent. A project with no Maintenance row has no maintenance budget.",
    input_schema: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] },
    run: async (a, c) => {
      const p = projectId(a.project_id);
      const rows = await c.data.query(`SELECT category, budget_usd, spent_usd, line_utilization_pct FROM ${T.ops("v_budget_by_line")} WHERE project_id = ${lit(p)} ORDER BY line_utilization_pct DESC`);
      return { rows, refs: [`ops.v_budget_by_line:${p}`] };
    },
  },
  {
    name: "pending_procurement",
    description: "Procurement requests not yet delivered, with days pending. Optional project filter.",
    input_schema: { type: "object", properties: { project_id: { type: "string" } } },
    run: async (a, c) => {
      const rows = await c.data.query(`SELECT * FROM ${T.ops("v_pending_procurement")} ${where([optProject(a)])} ORDER BY days_pending DESC`);
      return { rows, refs: refs("ops.v_pending_procurement", rows, "request_id") };
    },
  },
  {
    name: "open_vacancies",
    description: "Open posts with days open, stage and any interim cover. Optional project filter.",
    input_schema: { type: "object", properties: { project_id: { type: "string" } } },
    run: async (a, c) => {
      const rows = await c.data.query(`SELECT * FROM ${T.ops("v_open_vacancies")} ${where([optProject(a)])} ORDER BY days_open DESC`);
      return { rows, refs: refs("ops.v_open_vacancies", rows, "vacancy_id") };
    },
  },
  {
    name: "contract_expiry",
    description: "Consultant contracts ending within N days (default 30), with the projects they serve.",
    input_schema: { type: "object", properties: { within_days: { type: "integer" } } },
    run: async (a, c) => {
      const n = intIn(a.within_days, 1, 365, 30);
      const rows = await c.data.query(`SELECT * FROM ${T.ops("v_contract_expiry")} WHERE days_left <= ${n} ORDER BY days_left`);
      return { rows, refs: refs("ops.v_contract_expiry", rows, "person_id") };
    },
  },
  {
    name: "upcoming_deadlines",
    description: "Donor deadlines and milestones due within N days (default 90), with days left and status. Optional project filter.",
    input_schema: { type: "object", properties: { project_id: { type: "string" }, within_days: { type: "integer" } } },
    run: async (a, c) => {
      const n = intIn(a.within_days, 1, 730, 90);
      const rows = await c.data.query(`SELECT * FROM ${T.ops("v_upcoming_deadlines")} ${where([optProject(a), `days_left <= ${n}`])} ORDER BY days_left`);
      return { rows, refs: refs("ops.v_upcoming_deadlines", rows, "deadline_id") };
    },
  },
  {
    name: "projects_without_maintenance",
    description: "Projects that have no Maintenance budget line (post-grant sustainability risk).",
    input_schema: { type: "object", properties: {} },
    run: async (_a, c) => {
      const rows = await c.data.query(`SELECT * FROM ${T.ops("v_projects_without_maintenance")} ORDER BY project_id`);
      return { rows, refs: refs("ops.v_projects_without_maintenance", rows, "project_id") };
    },
  },
  {
    name: "travel_by_quarter",
    description: "Organisation-wide travel spend per quarter with quarter-on-quarter change in percent.",
    input_schema: { type: "object", properties: {} },
    run: async (_a, c) => {
      const raw = await c.data.query(`SELECT quarter_start, travel_usd FROM ${T.ops("v_travel_by_quarter")} ORDER BY quarter_start`);
      const rows = raw.map((r, i) => ({ ...r, qoq_pct: i === 0 ? null : Math.round(1000 * (Number(r.travel_usd) / Number(raw[i - 1].travel_usd) - 1)) / 10 }));
      return { rows, refs: ["ops.v_travel_by_quarter"] };
    },
  },
  {
    name: "kpi_series",
    description: "Field survey KPI time series with target. wards: 'ALL' (default, programme total) or 'BREAKDOWN' (per ward). KPI ids: K1 functional boreholes, K2 safe water access, K10 water committees, K3 business survival, K11 reinvestment, K4 youth placed, K7 clinic attendance, K12 skilled birth attendance, K13 datasets, K6 portal users, K5 vaccination coverage, K9 youth trained, K8 cooperative disputes.",
    input_schema: { type: "object", properties: { kpi_id: { type: "string" }, wards: { type: "string", enum: ["ALL", "BREAKDOWN"] }, since: { type: "string", description: "yyyy-mm-dd" } }, required: ["kpi_id"] },
    run: async (a, c) => {
      const k = kpiId(a.kpi_id); const since = dateStr(a.since);
      const wardCond = a.wards === "BREAKDOWN" ? `s.ward <> 'ALL'` : `s.ward = 'ALL'`;
      const rows = await c.data.query(
        `SELECT k.kpi_id, k.name, k.unit, k.target, k.direction, s.ward, s.period_month, s.value
         FROM ${T.kobo("kobo_submissions")} s JOIN ${T.kobo("kpi_definitions")} k ON k.kpi_id = s.kpi_id
         WHERE s.kpi_id = ${lit(k)} AND ${wardCond} ${since ? `AND s.period_month >= DATE ${lit(since)}` : ""}
         ORDER BY s.period_month, s.ward LIMIT 300`);
      return { rows, refs: [`kobo.kpi:${k}`] };
    },
  },
  {
    name: "search_evidence",
    description: "Keyword search over document paragraphs and titles (reports, minutes, emails, lessons learned, audits). Returns ranked paragraphs with chunk_id, document title, type, date and the PROJECT each belongs to. Always check the project before using a paragraph as evidence: similar wording can come from a different project. Filter by project_id and doc_types where you can.",
    input_schema: { type: "object", properties: {
      terms: { type: "array", items: { type: "string" }, description: "1 to 8 lowercase keywords or short phrases" },
      project_id: { type: "string" },
      doc_types: { type: "array", items: { type: "string" }, description: "lessons_learned, site_visit_note, email_thread, donor_review, finance_review, meeting_minutes, audit, evaluation_draft, outcomes_survey, health_check, board_paper, policy, hr_memo, field_report" },
      limit: { type: "integer" } }, required: ["terms"] },
    run: async (a, c) => {
      const terms = (Array.isArray(a.terms) ? a.terms : []).map((t: unknown) => cleanTerm(String(t))).filter(Boolean).slice(0, 8);
      if (!terms.length) throw new Error("terms required");
      const types = (Array.isArray(a.doc_types) ? a.doc_types : []).map((t: unknown) => String(t)).filter((t: string) => /^[a-z_]+$/.test(t));
      const hit = (t: string) => `(lower(c.text) LIKE ${lit(`%${t}%`)} OR lower(d.title) LIKE ${lit(`%${t}%`)})`;
      const hits = terms.map((t: string) => `(CASE WHEN ${hit(t)} THEN 1 ELSE 0 END)`).join(" + ");
      const any = terms.map(hit).join(" OR ");
      const rows = await c.data.query(
        `SELECT c.chunk_id, d.title, d.doc_type, d.created_on, d.project_id, p.name AS project_name, c.text, (${hits}) AS hits
         FROM ${T.docs("document_chunks")} c
         JOIN ${T.docs("documents")} d ON d.doc_id = c.doc_id
         LEFT JOIN ${T.ops("projects")} p ON p.project_id = d.project_id
         ${where([a.project_id ? `d.project_id = ${lit(projectId(a.project_id))}` : null, types.length ? `d.doc_type IN (${types.map(lit).join(",")})` : null, `(${any})`])}
         ORDER BY hits DESC, d.created_on DESC LIMIT ${intIn(a.limit, 1, 20, 8)}`);
      return { rows, refs: rows.map((r) => String(r.chunk_id)) };
    },
  },
  {
    name: "recall_memory",
    description: "Recall organizational memory (Meterless H-MEM): lessons from past and sister projects and earlier findings, ranked, with provenance. Use it for 'have we seen this before' and 'what worked' questions.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    run: async (a, c) => {
      const mem = c.memory.recall(String(a.query ?? ""), 5);
      return { rows: mem as unknown as Row[], refs: mem.flatMap((m) => m.refs) };
    },
  },
  {
    name: "record_finding",
    description: "Record one finding in organizational memory and the evidence graph. Call once per key finding BEFORE your final answer. evidence_refs must be chunk_ids or view refs returned by other tools.",
    input_schema: { type: "object", properties: {
      project_id: { type: "string" }, statement: { type: "string" },
      evidence_refs: { type: "array", items: { type: "string" } }, confidence: { type: "number", description: "0 to 1" } },
      required: ["project_id", "statement", "evidence_refs", "confidence"] },
    run: async (a, c) => {
      const conf = Math.min(1, Math.max(0, Number(a.confidence)));
      const r = await c.memory.rememberFinding({ projectId: projectId(a.project_id), statement: String(a.statement), evidenceRefs: (a.evidence_refs ?? []).map(String), confidence: conf });
      c.findingIds.push(r.entityId);
      return { refs: [r.memoryId], memory_id: r.memoryId, graph_entity: r.entityId };
    },
  },
  {
    name: "propose_decision",
    description: "Propose an action for a human to approve. It is stored as Pending; nothing is executed. Include the rationale and evidence_refs.",
    input_schema: { type: "object", properties: {
      project_id: { type: "string" }, title: { type: "string" }, rationale: { type: "string" },
      evidence_refs: { type: "array", items: { type: "string" } } }, required: ["project_id", "title", "rationale", "evidence_refs"] },
    run: async (a, c) => {
      const p = projectId(a.project_id); const title = String(a.title).slice(0, 200);
      if (c.dryRun) return { refs: [], note: "dry run: decision not stored", title };
      // Never re-propose something already proposed or decided (approved, rejected or deferred) for the same project.
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const dup = (await c.writer.list()).find((d) => d.project_id === p && norm(String(d.title)) === norm(title));
      if (dup) return { refs: [`ops.decisions:${dup.decision_id}`], decision_id: dup.decision_id, status: dup.status, note: `already ${String(dup.status).toLowerCase()}, not proposed again` };
      const { decisionId } = await c.writer.propose({ projectId: p, title, rationale: String(a.rationale), evidenceRefs: (a.evidence_refs ?? []).map(String), createdBy: c.actor, createdAt: c.asOf });
      await c.memory.linkDecision(p, decisionId, title, c.findingIds);
      return { refs: [`ops.decisions:${decisionId}`], decision_id: decisionId, status: "Pending" };
    },
  },
];

export async function runTool(name: string, args: Record<string, any>, ctx: ToolContext): Promise<ToolResult> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`unknown tool ${name}`);
  return t.run(args ?? {}, ctx);
}
export const anthropicTools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
