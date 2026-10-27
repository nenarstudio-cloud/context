// Evaluator (the critic). Two layers:
//   1. A code check with no model: refs must exist, paragraphs must belong to the project, numbers must be in the cited evidence.
//   2. One model call that reviews the findings against the evidence the Investigators actually retrieved.
// Code issues always count. If the model critic is unreachable, the code check still runs and the trace says so.
import { chatJson } from "../llm.ts";
import { checkFindings, type Finding, type Issue } from "../evidence.ts";
import { EVALUATOR_SYSTEM } from "./prompts.ts";
import type { RoleEnv } from "./types.ts";

export interface Evaluation { verdict: "pass" | "revise"; issues: Issue[]; summary: string; criticRan: boolean; skipped?: boolean }

export async function runEvaluator(question: string, asOf: string, findings: Finding[], env: RoleEnv, round: number, useModel = true): Promise<Evaluation> {
  const codeIssues = checkFindings(findings, env.pool, question);
  env.tracer.add({ role: "Evaluator", action: "check", ok: codeIssues.length === 0, note: `round ${round}: code check found ${codeIssues.length} issue(s) in ${findings.length} finding(s)` });

  let modelIssues: Issue[] = [];
  let summary = "";
  let criticRan = false;
  if (!useModel) {
    env.tracer.add({ role: "Evaluator", action: "model", ok: true, note: "model critic skipped on the re-check; the automatic evidence check still applies" });
    return { verdict: codeIssues.length ? "revise" : "pass", issues: codeIssues, summary: "", criticRan: false, skipped: true };
  }
  try {
    let budget = 14000;
    const digest = findings.map((f, i) => {
      const ev = f.evidence_refs.slice(0, 6).map((r) => { const x = env.pool.excerpt(r, 1100); budget -= x.length; return budget > 0 ? `   - ${x}` : `   - ${r} (excerpt omitted)`; }).join("\n");
      return `Finding ${i} [project ${f.project_id}, ${f.kind}, confidence ${f.confidence}]: ${f.statement}\n   cites: ${f.evidence_refs.join(", ")}\n   evidence:\n${ev}`;
    }).join("\n\n");
    const { res, json: j, retried } = await chatJson<{ verdict?: unknown; summary?: unknown; issues?: unknown }>(
      [{ role: "system", content: EVALUATOR_SYSTEM(asOf) }, { role: "user", content: `Leadership question: ${question}\n\n${digest}` }],
      { maxTokens: 8192, retryMaxTokens: 16384, deadline: env.deadline },
    );
    env.tracer.reason("Evaluator", res.reasoning);
    if (j) {
      criticRan = true;
      summary = typeof j.summary === "string" ? j.summary.slice(0, 240) : "";
      if (Array.isArray(j.issues)) {
        modelIssues = (j.issues as unknown[])
          .map((x) => {
            const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            const idx = Number(o.finding_index);
            const problem = typeof o.problem === "string" ? o.problem.trim().slice(0, 400) : "";
            return problem && Number.isInteger(idx) && idx >= -1 && idx < findings.length ? ({ finding_index: idx, problem, source: "model" } as Issue) : null;
          })
          .filter((x): x is Issue => x !== null)
          .slice(0, 8);
      }
    }
    env.tracer.add({ role: "Evaluator", action: "model", ms: res.ms, ok: criticRan, note: `${res.model}; critic ${criticRan ? "ran" : "returned no usable JSON"}${retried ? " (needed a retry)" : ""}; ${modelIssues.length} issue(s)` });
  } catch (e) {
    if ((e as Error).name === "RunLimitError") throw e;
    env.tracer.add({ role: "Evaluator", action: "fallback", ok: false, note: `model critic unavailable (${(e as Error).message}); code check only` });
  }

  const issues = [...codeIssues, ...modelIssues];
  if (issues.length) env.tracer.add({ role: "Evaluator", action: "issues", ok: false, note: issues.slice(0, 4).map((x) => `[${x.source} #${x.finding_index}] ${x.problem}`).join(" | ") });
  return { verdict: issues.length ? "revise" : "pass", issues, summary, criticRan };
}
