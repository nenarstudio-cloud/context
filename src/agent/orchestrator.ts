// The team: Planner -> Investigators (parallel) -> Evaluator (critic, revision loop) -> Reporter.
// Only findings that pass the Evaluator's code check are written to organizational memory and the evidence graph,
// and only decisions backed by those findings are proposed. Every step is traced. The whole run is time limited.
// If anything fatal happens (model unreachable, time limit, no findings survive), runTeam throws and the caller
// falls back to the scripted replay path and labels it as such.
import { config } from "../config.ts";
import { runTool, type ToolContext } from "../tools/index.ts";
import { summarize } from "./investigate.ts";
import { EvidencePool, checkFindings, type Finding, type Issue } from "./evidence.ts";
import { Tracer } from "./trace.ts";
import { RunLimitError } from "./llm.ts";
import { runPlanner } from "./roles/planner.ts";
import { runInvestigator } from "./roles/investigator.ts";
import { runEvaluator, type Evaluation } from "./roles/evaluator.ts";
import { runReporter, scrubUnsupported } from "./roles/reporter.ts";
import type { RoleEnv, TeamEvent } from "./roles/types.ts";

export interface TeamResult {
  answer: string; runId: string; tracePath: string | null; mode: "live";
  rounds: number; verdict: "pass" | "pass-with-caveats"; findings: number; dropped: number; decisions: number; ms: number;
  criticRan: boolean;
}
export interface TeamOptions { emit?: (e: TeamEvent) => void; runLimitSec?: number; reserveSec?: number; maxRounds?: number; persistTrace?: boolean }

/** Findings handed to the Reporter: at most 10, always keeping the best precedents. */
function pickForReport(findings: Finding[], max = 10): Finding[] {
  if (findings.length <= max) return findings;
  const byConf = (a: Finding, b: Finding) => b.confidence - a.confidence;
  const prec = findings.filter((f) => f.kind === "precedent").sort(byConf).slice(0, 3);
  const rest = findings.filter((f) => !prec.includes(f)).sort(byConf).slice(0, max - prec.length);
  return [...rest, ...prec];
}

/** Code issues always send findings back. Model only objections get one revision round, then they become caveats. */
const needsRevision = (ev: { verdict: string; issues: Issue[] }, round: number) => ev.issues.some((x) => x.source === "code") || (round === 0 && ev.issues.length > 0);

async function pooled<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function runTeam(question: string, ctx: ToolContext, o: TeamOptions = {}): Promise<TeamResult> {
  const emit = o.emit ?? (() => {});
  const limitSec = o.runLimitSec ?? Number(process.env.CONTEXT_RUN_LIMIT_SEC ?? 600);
  const maxRounds = o.maxRounds ?? Number(process.env.CONTEXT_MAX_REVISIONS ?? 1);
  const tracer = new Tracer(config.stateDir, question, o.persistTrace ?? process.env.CONTEXT_EPHEMERAL !== "1");
  const pool = new EvidencePool();
  const started = Date.now();
  // Investigation and revision stop at the soft deadline, so the Reporter always has time left to write the answer.
  const reserveMs = (o.reserveSec ?? Math.min(120, limitSec * 0.25)) * 1000;
  const hard = started + limitSec * 1000;
  const env: RoleEnv = { emit, tracer, pool, deadline: hard - reserveMs };
  const reportEnv: RoleEnv = { emit, tracer, pool, deadline: hard };
  let seq = 0;
  const role = async <T>(name: string, fn: () => Promise<T>, note?: (r: T) => string): Promise<T> => {
    const id = `role-${++seq}`;
    emit({ type: "role", id, role: name, status: "running" });
    try {
      const r = await fn();
      emit({ type: "role", id, role: name, status: "ok", note: note?.(r) });
      return r;
    } catch (e) {
      emit({ type: "role", id, role: name, status: "error", note: (e as Error).message });
      throw e;
    }
  };

  try {
    // ---- Planner ----
    const projects = (await runTool("project_health", {}, ctx)).rows ?? [];
    tracer.add({ role: "Planner", action: "tool", tool: "project_health", ok: true, note: `${projects.length} project(s) listed for the plan` });
    const plan = await role("Planner", () => runPlanner(question, ctx.asOf, projects, env), (p) => `${p.subQuestions.length} sub question(s)`);
    const fallbackProject = plan.projectIds[0] ?? null;

    // Organizational memory (Meterless H-MEM) is consulted on every run, not only when a model remembers to ask:
    // what happened in earlier cases, what leadership decided. Hits go into the evidence pool with their provenance.
    {
      const id = "recall-0", args = { query: question };
      emit({ type: "tool", id, name: "recall_memory", args, status: "running" });
      const t0 = Date.now();
      try {
        const r = await runTool("recall_memory", args, ctx);
        pool.add({ id, name: "recall_memory", args, ok: true, refs: r.refs, text: JSON.stringify(r).slice(0, 24000), rows: r.rows });
        emit({ type: "tool", id, name: "recall_memory", args, status: "ok", summary: summarize(r), refs: r.refs.slice(0, 12) });
        tracer.add({ role: "Planner", action: "tool", tool: "recall_memory", args_summary: JSON.stringify(args), ms: Date.now() - t0, ok: true, note: summarize(r) });
      } catch (e) {
        emit({ type: "tool", id, name: "recall_memory", args, status: "error", summary: (e as Error).message });
        tracer.add({ role: "Planner", action: "tool", tool: "recall_memory", ok: false, ms: Date.now() - t0, note: (e as Error).message });
      }
    }

    // ---- Investigators, two at a time ----
    const first = await pooled(plan.subQuestions, 2, async (sq, i) => {
      try {
        return await role(`Investigator ${i + 1}`, () => runInvestigator({ label: `Investigator ${i + 1}`, question, subQuestion: sq.question, ctx, env, fallbackProject }), (r) => `${r.findings.length} finding(s)`);
      } catch (e) {
        if (e instanceof RunLimitError) return { findings: [] as Finding[], gaps: ["The time limit was reached before one sub question was finished."] };
        throw e;
      }
    });
    let findings: Finding[] = first.flatMap((r) => r.findings);
    const gaps = first.flatMap((r) => r.gaps);
    if (!findings.length) throw new Error("the Investigators returned no findings");

    // ---- Evaluator with revision rounds (stops at the soft deadline, keeping what is verified) ----
    let rounds = 0, timedOut = false, criticRan = false;
    let wholeSet: string[] = [];
    let evalRes: Evaluation = { verdict: "revise", issues: [], summary: "", criticRan: false };
    const evalLabel = (e: Evaluation) => (e.verdict === "pass" ? "pass" : `revise (${e.issues.length} issue${e.issues.length === 1 ? "" : "s"})`);
    try {
      evalRes = await role("Evaluator", () => runEvaluator(question, ctx.asOf, findings, env, rounds, true), evalLabel);
      criticRan = evalRes.criticRan;
      wholeSet = evalRes.issues.filter((x) => x.source === "model" && x.finding_index === -1).map((x) => x.problem);
      while (needsRevision(evalRes, rounds) && rounds < maxRounds) {
        rounds++;
        const flagged = [...new Set(evalRes.issues.map((x) => x.finding_index).filter((n) => n >= 0))];
        const targets = flagged.length ? flagged : findings.map((_, i) => i);
        // The revising Investigator sees only the flagged findings, so renumber the issues to match what it sees.
        const pos = new Map(targets.map((orig, k) => [orig, k] as const));
        const issues: Issue[] = evalRes.issues.map((x) => ({ ...x, finding_index: pos.get(x.finding_index) ?? -1 }));
        const revised = await role(`Investigator R${rounds}`, () => runInvestigator({
          label: `Investigator R${rounds}`, question, subQuestion: question, ctx, env, fallbackProject, maxCalls: 4,
          revise: { findings: targets.map((i) => findings[i]), issues },
        }), (r) => `${r.findings.length} revised finding(s)`);
        tracer.add({ role: "Orchestrator", action: "revise", ok: true, note: `round ${rounds}: ${targets.length} finding(s) sent back, ${revised.findings.length} returned` });
        findings = [...findings.filter((_, i) => !targets.includes(i)), ...revised.findings];
        if (!findings.length) throw new Error("no findings left after revision");
        // The model critic reviews once. After a revision only the automatic evidence check runs again.
        evalRes = await role("Evaluator", () => runEvaluator(question, ctx.asOf, findings, env, rounds, false), evalLabel);
      }
    } catch (e) {
      if (!(e instanceof RunLimitError)) throw e;
      timedOut = true;
      evalRes = { ...evalRes, issues: [] };
      tracer.add({ role: "Orchestrator", action: "check", ok: false, note: "time limit reached during evaluation or revision; continuing with the findings that pass the code check" });
    }

    // ---- Final gate: anything that still fails the code check is dropped, model only caveats are kept as caveats ----
    const failing = new Set(checkFindings(findings, pool, question).map((x) => x.finding_index));
    const passed = findings.filter((_, i) => !failing.has(i));
    const dropped = findings.length - passed.length;
    if (!passed.length) throw new Error("no finding passed the evidence check");
    // Model objections: if nothing was revised they apply to the current findings; after a revision only whole set remarks carry over.
    const caveats = rounds === 0 ? evalRes.issues.filter((x) => x.source === "model" && !failing.has(x.finding_index)).map((x) => x.problem) : [...wholeSet];
    if (dropped) caveats.push(`${dropped} claim${dropped === 1 ? " was" : "s were"} dropped because the Evaluator could not verify ${dropped === 1 ? "it" : "them"} against the retrieved evidence.`);
    if (timedOut) caveats.push("The time limit was reached during review, so some findings were not re-checked by the model critic. Only findings that passed the automatic evidence check are included.");
    else if (!criticRan) caveats.push("The model critic was unavailable, so only the automatic evidence check was applied.");
    tracer.add({ role: "Orchestrator", action: "check", ok: true, note: `${passed.length} finding(s) passed, ${dropped} dropped, ${rounds} revision round(s)` });

    // ---- Reporter ----
    const reported = pickForReport(passed);
    // Retrieved organizational memory (H-MEM), quoted as is, can fill the Pattern line when no finding is marked precedent.
    const memoryHits = pool.records
      .filter((r) => r.ok && r.name === "recall_memory")
      .flatMap((r) => (r.rows ?? []).filter((x) => String(x.origin ?? "") !== "plan_completion").map((x) => ({ content: String(x.content ?? ""), refs: Array.isArray(x.refs) ? (x.refs as unknown[]).map(String) : [] })))
      .filter((m) => m.content && m.refs.length && m.refs.every((ref) => pool.hasRef(ref)))
      .slice(0, 2);
    const report = await role("Reporter", () => runReporter(question, ctx.asOf, reported, gaps, caveats, reportEnv, memoryHits), (r) => `${r.decisions.length} decision(s) proposed`);

    // ---- Keep invented owners and dates out of the answer and out of the proposals ----
    const corpus = reported.map((f) => f.statement).join("\n") + "\n" + pool.corpusFor([...new Set(reported.flatMap((f) => f.evidence_refs))]);
    const scrubbedAnswer = scrubUnsupported(report.answer, corpus, ctx.asOf);
    report.answer = scrubbedAnswer.text;
    let scrubbed = scrubbedAnswer.replaced;
    for (const d of report.decisions) {
      const t = scrubUnsupported(d.title, corpus, ctx.asOf), r = scrubUnsupported(d.rationale, corpus, ctx.asOf);
      d.title = t.text; d.rationale = r.text; scrubbed += t.replaced + r.replaced;
    }
    if (scrubbed) tracer.add({ role: "Orchestrator", action: "check", ok: true, note: `${scrubbed} owner or date entr${scrubbed === 1 ? "y was" : "ies were"} not in the evidence and replaced by "to be assigned" or "date to be agreed"` });

    // ---- Record only checked work ----
    for (const f of reported) {
      const args = { project_id: f.project_id, statement: f.statement, evidence_refs: f.evidence_refs, confidence: f.confidence };
      const id = `rec-${++seq}`;
      emit({ type: "tool", id, name: "record_finding", args, status: "running" });
      try {
        const r = await runTool("record_finding", args, ctx);
        emit({ type: "tool", id, name: "record_finding", args, status: "ok", summary: summarize(r), refs: r.refs.slice(0, 12) });
        tracer.add({ role: "Reporter", action: "record", tool: "record_finding", ok: true, note: `memory ${r.refs[0] ?? ""}` });
      } catch (e) {
        emit({ type: "tool", id, name: "record_finding", args, status: "error", summary: (e as Error).message });
        tracer.add({ role: "Reporter", action: "record", tool: "record_finding", ok: false, note: (e as Error).message });
      }
    }
    let proposed = 0;
    for (const d of report.decisions) {
      const id = `prop-${++seq}`;
      emit({ type: "tool", id, name: "propose_decision", args: d, status: "running" });
      try {
        const r = await runTool("propose_decision", d as unknown as Record<string, unknown>, ctx);
        proposed++;
        emit({ type: "tool", id, name: "propose_decision", args: d, status: "ok", summary: summarize(r), refs: r.refs.slice(0, 12) });
        tracer.add({ role: "Reporter", action: "propose", tool: "propose_decision", ok: true, note: d.title });
      } catch (e) {
        emit({ type: "tool", id, name: "propose_decision", args: d, status: "error", summary: (e as Error).message });
        tracer.add({ role: "Reporter", action: "propose", tool: "propose_decision", ok: false, note: (e as Error).message });
      }
    }

    // ---- Answer ----
    let answer = report.answer;
    if (dropped && !/dropped because/i.test(answer)) {
      const note = `${dropped} claim${dropped === 1 ? " was" : "s were"} dropped because ${dropped === 1 ? "it" : "they"} could not be verified against the evidence.`;
      answer = /^Confidence and gaps:/im.test(answer) ? answer.replace(/^(Confidence and gaps:.*)$/im, `$1 ${note}`) : `${answer}\n\nConfidence and gaps: ${note}`;
    }
    if ((timedOut || !criticRan) && !/time limit was reached|critic was unavailable/i.test(answer)) {
      const note = timedOut ? "The time limit was reached during review, so some findings were not re-checked by the model critic." : "The model critic was unavailable, so only the automatic evidence check was applied.";
      answer = /^Confidence and gaps:/im.test(answer) ? answer.replace(/^(Confidence and gaps:.*)$/im, `$1 ${note}`) : `${answer}\n\nConfidence and gaps: ${note}`;
    }
    if (scrubbed) answer = /^Confidence and gaps:/im.test(answer) ? answer.replace(/^(Confidence and gaps:.*)$/im, `$1 ${scrubbed} owner or date suggestion${scrubbed === 1 ? " was" : "s were"} not in the evidence and left open.`) : answer;
    emit({ type: "answer", text: answer });
    const ms = Date.now() - started;
    const verdict = evalRes.verdict === "pass" && !dropped && !timedOut ? "pass" : "pass-with-caveats";
    tracer.meta = { mode: "live", rounds, verdict, findings: passed.length, dropped, decisions: proposed, critic: criticRan, timed_out: timedOut, as_of: ctx.asOf };
    const tracePath = tracer.save();
    return { answer, runId: tracer.runId, tracePath, mode: "live", rounds, verdict, findings: passed.length, dropped, decisions: proposed, ms, criticRan };
  } catch (e) {
    tracer.add({ role: "Orchestrator", action: e instanceof RunLimitError ? "error" : "fallback", ok: false, note: (e as Error).message });
    tracer.meta = { mode: "failed", error: (e as Error).message };
    tracer.save();
    (e as Error & { runId?: string }).runId = tracer.runId;
    throw e;
  }
}
