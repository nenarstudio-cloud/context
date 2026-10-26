// Run tracing. Every step of every role is written as one event. The saved file under
// <stateDir>/traces/<run_id>.json also keeps the model's reasoning text (for debugging).
// The API response and the UI only ever get the events, never the reasoning, never a key, never a full prompt.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface TraceEvent {
  t: number;                 // ms since the run started
  role: string;              // Planner, Investigator 1, Evaluator, Reporter, Orchestrator
  action: string;            // model, tool, check, revise, record, propose, fallback, error
  tool?: string;
  args_summary?: string;
  ms?: number;
  ok: boolean;
  note?: string;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "..." : s);

export class Tracer {
  readonly runId = `run-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  readonly events: TraceEvent[] = [];
  private reasoning: { role: string; text: string }[] = [];
  private started = Date.now();
  meta: Record<string, unknown> = {};

  constructor(private dir: string, readonly question: string, private persist = true) {}

  add(e: Omit<TraceEvent, "t">) {
    const ev: TraceEvent = { t: Date.now() - this.started, ...e };
    if (ev.args_summary) ev.args_summary = clip(ev.args_summary, 200);
    if (ev.note) ev.note = clip(ev.note, 300);
    this.events.push(ev);
    return ev;
  }

  /** Reasoning text stays in the saved file only. */
  reason(role: string, text: string | null) {
    if (text) this.reasoning.push({ role, text: clip(text, 8000) });
  }

  save(): string | null {
    if (!this.persist) return null;
    try {
      const dir = path.join(this.dir, "traces");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${this.runId}.json`);
      fs.writeFileSync(file, JSON.stringify({ run_id: this.runId, question: this.question, ms: Date.now() - this.started, ...this.meta, events: this.events, reasoning: this.reasoning }, null, 2));
      return file;
    } catch {
      return null;
    }
  }
}

/** Read a saved trace for the API. Reasoning text is removed. */
export function readTrace(dir: string, runId: string): Record<string, unknown> | null {
  if (!/^run-[a-z0-9]+-[a-f0-9]{6}$/.test(runId)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, "traces", `${runId}.json`), "utf-8")) as Record<string, unknown>;
    delete j.reasoning;
    return j;
  } catch {
    return null;
  }
}
