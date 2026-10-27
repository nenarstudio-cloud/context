// Reporter: runs only after the Evaluator. Writes the executive answer from checked findings and proposes decisions.
// Safeguards in code: citations not present in the findings are removed, and if the model returns nothing usable
// the answer is composed from the findings directly, so a run never ends without an answer.
import { chat, extractJson, pickModel } from "../llm.ts";
import type { Finding } from "../evidence.ts";
import { REPORTER_SYSTEM } from "./prompts.ts";
import type { RoleEnv } from "./types.ts";

export interface ReportDecision { project_id: string; title: string; rationale: string; evidence_refs: string[] }

const REF_LIKE = /^(?:doc-\d{3}#\d{1,2}|(?:ops|kobo)\.\S+|mem-\S+|dec-\S+)$/;

/** Remove citations that are not backed by a checked finding. Returns the cleaned text and how many were removed. */
export function sanitizeCitations(text: string, allowed: Set<string>): { text: string; removed: number } {
  let removed = 0;
  const out = text.replace(/\[([^\[\]\n]+)\]/g, (m, inner: string) => {
    const parts = inner.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length || !parts.every((p) => REF_LIKE.test(p))) return m;
    const keep = parts.filter((p) => allowed.has(p));
    removed += parts.length - keep.length;
    return keep.length ? `[${keep.join(", ")}]` : "";
  });
  return { text: out.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " "), removed };
}

function composeFromFindings(findings: Finding[], caveats: string[]): string {
  const facts = findings.filter((f) => f.kind !== "precedent");
  const prec = findings.filter((f) => f.kind === "precedent");
  const cite = (f: Finding) => (f.evidence_refs.length ? ` [${f.evidence_refs.join(", ")}]` : "");
  const lead = (facts[0] ?? findings[0]).statement;
  return [
    `Answer: ${lead}`,
    "",
    "Evidence:",
    ...facts.map((f) => `- ${f.statement}${cite(f)}`),
    "",
    `Pattern: ${prec.length ? prec.map((f) => `${f.statement}${cite(f)}`).join(" ") : "No precedent found."}`,
    "",
    "Recommended actions: none could be written automatically. Review the findings above and decide.",
    "",
    `Confidence and gaps: composed directly from the checked findings because the Reporter model returned nothing usable.${caveats.length ? " " + caveats.join(" ") : ""}`,
  ].join("\n");
}

export async function runReporter(
  question: string, asOf: string, findings: Finding[], gaps: string[], caveats: string[], env: RoleEnv, memory: MemoryHit[] = [],
): Promise<{ answer: string; decisions: ReportDecision[]; removedCitations: number; composed: boolean }> {
  const allowed = new Set(findings.flatMap((f) => f.evidence_refs));
  const list = findings.map((f, i) => `Finding ${i + 1} [project ${f.project_id}, ${f.kind}, confidence ${f.confidence}]: ${f.statement}\n   refs: ${f.evidence_refs.join(", ")}`).join("\n\n");
  const extra = [gaps.length ? `Gaps reported by the Investigators:\n${gaps.map((g) => "- " + g).join("\n")}` : "", caveats.length ? `Caveats from the Evaluator:\n${caveats.map((g) => "- " + g).join("\n")}` : ""].filter(Boolean).join("\n\n");
  let content = "", ms = 0, model = "";
  try {
    for (let attempt = 0; attempt < 2 && !content; attempt++) {
      const res = await chat(
        [{ role: "system", content: REPORTER_SYSTEM(asOf) }, { role: "user", content: `Leadership question: ${question}\n\nChecked findings:\n${list}${extra ? "\n\n" + extra : ""}` }],
        { model: pickModel("main"), maxTokens: attempt ? 16000 : 8192, deadline: env.deadline },
      );
      env.tracer.reason("Reporter", res.reasoning);
      content = res.content; ms += res.ms; model = res.model;
    }
  } catch (e) {
    if ((e as Error).name === "RunLimitError") throw e;
    env.tracer.add({ role: "Reporter", action: "fallback", ok: false, note: `${(e as Error).message}; composing the answer from the findings` });
  }

  const decisions: ReportDecision[] = [];
  let body = content;
  const re = /<decision>([\s\S]*?)<\/decision>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) && decisions.length < 3) {
    const j = extractJson<Record<string, unknown>>(m[1]);
    if (!j) continue;
    const pid = typeof j.project_id === "string" && /^pr\d{1,3}$/.test(j.project_id) ? j.project_id : null;
    const title = typeof j.title === "string" ? j.title.trim().slice(0, 200) : "";
    const rationale = typeof j.rationale === "string" ? j.rationale.trim().slice(0, 600) : "";
    let refs = Array.isArray(j.evidence_refs) ? j.evidence_refs.map((x) => String(x).trim()).filter((x) => allowed.has(x)) : [];
    if (!refs.length && pid) refs = [...new Set(findings.filter((f) => f.project_id === pid).flatMap((f) => f.evidence_refs))].slice(0, 6);
    if (pid && title.length >= 8 && rationale && refs.length) decisions.push({ project_id: pid, title, rationale, evidence_refs: refs });
  }
  body = body.replace(/<decision>[\s\S]*?<\/decision>/gi, "").replace(/<\/?answer>/gi, "").trim();

  let composed = false;
  if (!/^\s*Answer:/im.test(body) || body.length < 40) { body = composeFromFindings(findings, caveats); composed = true; }
  body = body.replace(/\s*\((?:caveat|note):[^)]*\)/gi, "");
  const filled = ensureSections(body, findings, decisions, gaps, memory);
  body = filled.text;
  for (const r of [...filled.extraRefs, ...decisions.flatMap((d) => d.evidence_refs)]) allowed.add(r);
  const clean = sanitizeCitations(body, allowed);
  env.tracer.add({ role: "Reporter", action: "model", ms, ok: !composed, note: `${model || "no model reply"}; ${decisions.length} decision(s); ${clean.removed} unbacked citation(s) removed${composed ? "; answer composed from findings" : ""}` });
  return { answer: clean.text.trim(), decisions, removedCitations: clean.removed, composed };
}

/**
 * The model may invent who owns an action or by when. Keep an ISO date or an "owner:" only if the same text
 * appears in the evidence the team retrieved (or is the organization's as-of date); otherwise replace it.
 */
export function scrubUnsupported(text: string, corpus: string, asOf: string): { text: string; replaced: number } {
  const hay = corpus.toLowerCase();
  let replaced = 0;
  let out = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => {
    if (d === asOf || hay.includes(d)) return d;
    replaced++;
    return "date to be agreed";
  });
  out = out.replace(/\b(before|by|on|until)\s+date to be agreed/gi, "$1 a date to be agreed");
  out = out.replace(/\bowner:\s*([^;\n)]+)/gi, (m, who: string) => {
    const w = who.trim().replace(/[.,]+$/, "").toLowerCase();
    if (!w || w === "to be assigned" || hay.includes(w)) return m;
    replaced++;
    return "owner: to be assigned";
  });
  return { text: out, replaced };
}

export interface MemoryHit { content: string; refs: string[] }
const HEADERS = ["Answer", "Evidence", "Pattern", "Recommended actions", "Confidence and gaps"];
const isHeader = (line: string) => HEADERS.some((h) => line.toLowerCase().startsWith(h.toLowerCase() + ":"));

/** Replace the body of one section when the model left it empty (or, for Pattern, claimed no precedent although one exists). */
function fillSection(text: string, header: string, filler: string[] | null, replaceIf?: (body: string) => boolean): string {
  if (!filler || !filler.length) return text;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.toLowerCase().startsWith(header.toLowerCase() + ":"));
  if (at < 0) return text;
  let end = at + 1;
  while (end < lines.length && !isHeader(lines[end])) end++;
  const body = [lines[at].slice(header.length + 1), ...lines.slice(at + 1, end)].join("\n").trim();
  if (body && !(replaceIf && replaceIf(body))) return text;
  const head = header === "Pattern" || header === "Confidence and gaps" ? `${header}: ${filler.join(" ")}` : [`${header}:`, ...filler].join("\n");
  return [...lines.slice(0, at), head, ...(end < lines.length ? ["", ...lines.slice(end)] : [])].join("\n");
}

/**
 * The answer must never have an empty section just because the model formatted it badly.
 * Everything filled in here comes from checked findings, the proposed decisions, or retrieved memory (quoted).
 */
export function ensureSections(
  text: string, findings: Finding[], decisions: ReportDecision[], gaps: string[], memory: MemoryHit[],
): { text: string; extraRefs: string[] } {
  const extraRefs: string[] = [];
  let out = text;
  const actions = decisions.length ? decisions.map((d, i) => `${i + 1}. ${d.title}. ${d.rationale} Owner: to be assigned; when: date to be agreed. [${d.evidence_refs.join(", ")}]`) : null;
  out = fillSection(out, "Recommended actions", actions);
  const prec = findings.filter((f) => f.kind === "precedent").slice(0, 2);
  let pattern: string[] | null = null;
  if (prec.length) pattern = prec.map((f) => `${f.statement} [${f.evidence_refs.join(", ")}]`);
  else if (memory.length) {
    pattern = memory.slice(0, 2).map((m) => { extraRefs.push(...m.refs); return `Organizational memory records: ${m.content.replace(/\s+/g, " ").slice(0, 240)} [${m.refs.join(", ")}]`; });
  }
  out = fillSection(out, "Pattern", pattern, (b) => /no precedent/i.test(b));
  const avg = findings.length ? findings.reduce((a, f) => a + f.confidence, 0) / findings.length : 0;
  const label = avg >= 0.8 ? "High" : avg >= 0.6 ? "Medium" : "Low";
  const conf = [`${label} (average confidence ${avg.toFixed(2)} across ${findings.length} checked finding${findings.length === 1 ? "" : "s"}).`, ...(gaps.length ? [`Gaps: ${gaps.slice(0, 2).join(" ")}`] : [])];
  out = fillSection(out, "Confidence and gaps", conf);
  return { text: out, extraRefs };
}
