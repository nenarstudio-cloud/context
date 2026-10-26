import { chatJson, pickModel } from "../llm.ts";
import { PLANNER_SYSTEM } from "./prompts.ts";
import type { RoleEnv } from "./types.ts";
import type { Row } from "../../ports.ts";

export interface Plan { approach: string; projectIds: string[]; subQuestions: { id: string; question: string; focus: string }[] }

const FOCUS = new Set(["ops", "survey", "documents", "memory"]);

/** One model call (the fast model if configured). Falls back to a single sub question equal to the user's question. */
export async function runPlanner(question: string, asOf: string, projects: Row[], env: RoleEnv, maxSub = 2): Promise<Plan> {
  const fallback: Plan = { approach: "Investigate the question as asked.", projectIds: [], subQuestions: [{ id: "q1", question, focus: "ops" }] };
  const list = projects.map((p) => `${String(p.project_id)}: ${String(p.name)}`).join("\n");
  try {
    const { res, json: j } = await chatJson<{ approach?: unknown; project_ids?: unknown; sub_questions?: unknown }>(
      [{ role: "system", content: PLANNER_SYSTEM(asOf) }, { role: "user", content: `Leadership question: ${question}\n\nProjects:\n${list || "(none listed)"}` }],
      { model: pickModel("fast"), maxTokens: 4096, deadline: env.deadline },
    );
    env.tracer.reason("Planner", res.reasoning);
    const valid = new Set(projects.map((p) => String(p.project_id)));
    const projectIds = Array.isArray(j?.project_ids) ? [...new Set(j!.project_ids.map(String))].filter((x) => valid.size === 0 || valid.has(x)).slice(0, 4) : [];
    const subs = Array.isArray(j?.sub_questions)
      ? (j!.sub_questions as unknown[])
          .map((s, i) => {
            const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
            const q = typeof o.question === "string" ? o.question.trim().slice(0, 400) : "";
            return q.length >= 8 ? { id: `q${i + 1}`, question: q, focus: FOCUS.has(String(o.focus)) ? String(o.focus) : "ops" } : null;
          })
          .filter((x): x is { id: string; question: string; focus: string } => x !== null)
          .slice(0, maxSub)
      : [];
    env.tracer.add({ role: "Planner", action: "model", ms: res.ms, ok: subs.length > 0, note: `${res.model}; ${subs.length} sub question(s)` });
    if (!subs.length) return { ...fallback, projectIds };
    return { approach: typeof j?.approach === "string" ? j.approach.slice(0, 200) : "", projectIds, subQuestions: subs };
  } catch (e) {
    if ((e as Error).name === "RunLimitError") throw e;
    env.tracer.add({ role: "Planner", action: "fallback", ok: false, note: `${(e as Error).message}; investigating the question as asked` });
    return fallback;
  }
}
