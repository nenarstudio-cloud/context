// Evidence pool and the Evaluator's code check (no model involved).
// A finding passes only if: it cites at least one reference, every reference was really returned by a tool
// in this run, document paragraphs belong to the finding's project (or the finding is marked as a precedent),
// and every number in the statement appears in the tool results it cites.
import type { Row } from "../ports.ts";

export interface Finding {
  project_id: string;
  statement: string;
  kind: "fact" | "inference" | "precedent";
  evidence_refs: string[];
  confidence: number;
  from?: string;
}
export interface Issue { finding_index: number; problem: string; source: "code" | "model" }
export interface ToolRecord { id: string; name: string; args: unknown; ok: boolean; refs: string[]; text: string; rows?: Row[] }

export class EvidencePool {
  readonly records: ToolRecord[] = [];
  private refSet = new Set<string>();
  private byRef = new Map<string, ToolRecord[]>();
  private chunkProject = new Map<string, string | null>();

  add(rec: ToolRecord) {
    this.records.push(rec);
    if (!rec.ok) return;
    for (const r of rec.refs) {
      this.refSet.add(r);
      const list = this.byRef.get(r) ?? [];
      list.push(rec);
      this.byRef.set(r, list);
    }
    for (const row of rec.rows ?? []) {
      if (row && typeof row.chunk_id === "string") this.chunkProject.set(row.chunk_id, row.project_id ? String(row.project_id) : null);
    }
  }
  hasRef(ref: string) { return this.refSet.has(ref); }
  allRefs() { return [...this.refSet]; }
  projectOfChunk(ref: string): string | null | undefined { return this.chunkProject.get(ref); }

  /** Text of every tool result that returned any of these refs. */
  corpusFor(refs: string[]): string {
    const seen = new Set<ToolRecord>();
    for (const r of refs) for (const rec of this.byRef.get(r) ?? []) seen.add(rec);
    return [...seen].map((r) => r.text).join("\n");
  }

  /** A readable excerpt of the evidence behind one reference, for the model critic. Targets the exact row, not the whole tool result. */
  excerpt(ref: string, max = 1200): string {
    const recs = this.byRef.get(ref) ?? [];
    for (const rec of recs) {
      const row = (rec.rows ?? []).find((x) => x && x.chunk_id === ref);
      if (row) return `${ref} [${String(row.doc_type ?? "document")}, project ${String(row.project_id ?? "none")}] ${String(row.title ?? "")}: ${String(row.text ?? "").slice(0, max)}`;
    }
    const id = ref.includes(":") ? ref.slice(ref.lastIndexOf(":") + 1) : "";
    for (const rec of recs) {
      const hit = id ? (rec.rows ?? []).filter((x) => x && Object.values(x).some((v) => String(v) === id)) : [];
      if (hit.length) return `${ref} (${rec.name}): ${JSON.stringify(hit.slice(0, 12)).slice(0, max)}`;
    }
    const rec = recs[0];
    return rec ? `${ref} (${rec.name}): ${rec.text.slice(0, max)}` : `${ref}: not found`;
  }
}

/** Turn whatever the model returned into a clean Finding, or null if it is unusable. */
export function normalizeFinding(raw: unknown, fallbackProject: string | null, from?: string): Finding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const statement = typeof r.statement === "string" ? r.statement.trim().slice(0, 600) : "";
  if (statement.length < 12) return null;
  const pid = typeof r.project_id === "string" && /^pr\d{1,3}$/.test(r.project_id.trim()) ? r.project_id.trim() : fallbackProject;
  if (!pid) return null;
  const refs = Array.isArray(r.evidence_refs) ? [...new Set(r.evidence_refs.map((x) => String(x).trim()).filter(Boolean))].slice(0, 12) : [];
  const kind = r.kind === "inference" || r.kind === "precedent" ? r.kind : "fact";
  const c = Number(r.confidence);
  const confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.6;
  return { project_id: pid, statement, kind, evidence_refs: refs, confidence, from };
}

// ---------- number check ----------
interface Num { raw: string; target: number; integer: boolean; scaled: boolean }

export function statementNumbers(text: string): Num[] {
  const cleaned = text
    .replace(/\b(?:doc-\d{3}#\d+|dec-[a-z0-9]+|mem-\w+)\b/gi, " ")
    .replace(/\b(?:ops|kobo)\.[A-Za-z0-9_.:\-]+/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b[A-Za-z]{1,3}\d{1,3}\b/g, " ")
    .replace(/\bPhase\s+\d+\w*/gi, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ");
  const out: Num[] = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?%|\s?percent|\s?million|[kKmM](?![A-Za-z]))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const base = Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
    if (!Number.isFinite(base)) continue;
    const unit = (m[3] ?? "").trim().toLowerCase();
    const mult = unit === "k" ? 1000 : unit === "m" || unit === "million" ? 1_000_000 : 1;
    const hasUnit = unit !== "";
    if (Number.isInteger(base) && base <= 3 && !hasUnit) continue; // "1 late activity", "2 of 5": too small to be worth checking
    out.push({ raw: m[0].trim(), target: base * mult, integer: Number.isInteger(base), scaled: mult > 1 });
  }
  return out;
}

function corpusNumbers(corpus: string): number[] {
  const flat = corpus.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const set = new Set<number>();
  const re = /\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) && set.size < 6000) set.add(Number(m[0]));
  return [...set];
}

function close(c: number, n: Num): boolean {
  const tol = n.scaled ? Math.abs(n.target) * 0.006 : n.integer ? 0.5 : 0.05;
  return Math.abs(c - n.target) <= tol;
}

/** Numbers in the statement that cannot be found (or derived as a simple difference) in the cited evidence. */
export function unsupportedNumbers(statement: string, corpus: string, extra = ""): string[] {
  const nums = statementNumbers(statement);
  if (!nums.length) return [];
  const have = corpusNumbers(corpus + "\n" + extra);
  const sample = have.filter((x) => x >= 10).slice(0, 400); // small numbers (ids, months, counts) would make almost any difference match
  const bad: string[] = [];
  for (const n of nums) {
    if (have.some((c) => close(c, n))) continue;
    if (n.target <= 100000) {
      let derived = false;
      for (let i = 0; i < sample.length && !derived; i++) for (let j = i + 1; j < sample.length; j++) if (close(Math.abs(sample[i] - sample[j]), n)) { derived = true; break; }
      if (derived) continue;
    }
    bad.push(n.raw);
  }
  return bad;
}

const PRECEDENT_OK = (f: Finding) => f.kind === "precedent";

export function checkFindings(findings: Finding[], pool: EvidencePool, question = ""): Issue[] {
  const issues: Issue[] = [];
  findings.forEach((f, i) => {
    if (!f.evidence_refs.length) { issues.push({ finding_index: i, problem: "no evidence reference cited", source: "code" }); return; }
    const unknown = f.evidence_refs.filter((r) => !pool.hasRef(r));
    if (unknown.length) issues.push({ finding_index: i, problem: `these references were not returned by any tool in this run: ${unknown.join(", ")}`, source: "code" });
    const known = f.evidence_refs.filter((r) => pool.hasRef(r));
    for (const r of known) {
      const p = pool.projectOfChunk(r);
      if (p && p !== f.project_id && !PRECEDENT_OK(f)) issues.push({ finding_index: i, problem: `paragraph ${r} belongs to project ${p}, not ${f.project_id}; cite it only as a precedent from another project, or remove it`, source: "code" });
    }
    if (known.length) {
      const bad = unsupportedNumbers(f.statement, pool.corpusFor(known), question);
      if (bad.length) issues.push({ finding_index: i, problem: `these numbers do not appear in the cited evidence: ${bad.join(", ")}. Cite the source that contains them, correct them, or remove them`, source: "code" });
    }
  });
  return issues;
}
