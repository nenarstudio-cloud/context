// Investigator: runs one sub question with the read only tools and reports findings as JSON.
// It cannot write to memory or propose decisions: only findings that pass the Evaluator get recorded.
import { anthropicTools, runTool, type ToolContext } from "../../tools/index.ts";
import { chat, extractJson, type ChatMessage } from "../llm.ts";
import { summarize } from "../investigate.ts";
import { normalizeFinding, type Finding, type Issue } from "../evidence.ts";
import { INVESTIGATOR_SYSTEM } from "./prompts.ts";
import type { RoleEnv } from "./types.ts";

const WRITE_TOOLS = new Set(["record_finding", "propose_decision"]);
const READ_TOOLS = anthropicTools.filter((t) => !WRITE_TOOLS.has(t.name));
const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));
const OPENAI_TOOLS = READ_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

export interface InvestigatorInput {
  label: string;                 // "Investigator 1"
  question: string;              // the leadership question
  subQuestion: string;
  ctx: ToolContext;
  env: RoleEnv;
  fallbackProject: string | null;
  maxCalls?: number;
  revise?: { findings: Finding[]; issues: Issue[] };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export async function runInvestigator(i: InvestigatorInput): Promise<{ findings: Finding[]; gaps: string[] }> {
  const { env, ctx, label } = i;
  const maxCalls = i.maxCalls ?? 8;
  const user = i.revise
    ? `Leadership question: ${i.question}\n\nThe Evaluator rejected some of your findings. Fix them. You may call tools again (at most ${maxCalls} calls) to find the right evidence. Drop any finding you cannot support. Return the corrected findings in the same JSON format.\n\nFindings to fix:\n${JSON.stringify(i.revise.findings, null, 1)}\n\nIssues:\n${i.revise.issues.map((x) => `- finding ${x.finding_index}: ${x.problem}`).join("\n")}`
    : `Leadership question: ${i.question}\n\nYour sub question: ${i.subQuestion}`;
  const messages: ChatMessage[] = [{ role: "system", content: INVESTIGATOR_SYSTEM(ctx.asOf) }, { role: "user", content: user }];
  let calls = 0, nudged = false;
  const totalTurns = 10;

  for (let turn = 1; turn <= totalTurns; turn++) {
    const toolsOn = calls < maxCalls && turn <= totalTurns - 2;
    // Tools stay in the request on the last turns (some servers reject tool messages without them); tool_choice "none" stops further calls.
    const res = await chat(messages, { tools: OPENAI_TOOLS, toolChoice: toolsOn ? "auto" : "none", maxTokens: 4096, deadline: env.deadline });
    env.tracer.reason(label, res.reasoning);
    env.tracer.add({ role: label, action: "model", ms: res.ms, ok: true, note: `${res.model}; ${res.toolCalls.length} tool call(s)${res.content ? "; text reply" : ""}` });
    messages.push({ role: "assistant", content: res.content || null, ...(res.toolCalls.length ? { tool_calls: res.toolCalls } : {}) });

    if (res.toolCalls.length && toolsOn) {
      calls += res.toolCalls.length;
      const results = await Promise.all(res.toolCalls.map(async (c, k) => {
        const callId = c.id ?? `call_${turn}_${k}`;
        const evId = `${slug(label)}:${callId}`;
        const name = c.function?.name ?? "";
        let args: Record<string, unknown> = {};
        env.emit({ type: "tool", id: evId, name, args: c.function?.arguments, status: "running" });
        const t0 = Date.now();
        try {
          try { args = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { throw new Error("tool arguments were not valid JSON"); }
          if (!READ_NAMES.has(name)) throw new Error(`tool ${name} is not available to the Investigator`);
          const r = await runTool(name, args, ctx);
          const text = JSON.stringify(r).slice(0, 24000);
          env.pool.add({ id: evId, name, args, ok: true, refs: r.refs, text, rows: r.rows });
          env.emit({ type: "tool", id: evId, name, args, status: "ok", summary: summarize(r), refs: r.refs.slice(0, 12) });
          env.tracer.add({ role: label, action: "tool", tool: name, args_summary: JSON.stringify(args), ms: Date.now() - t0, ok: true, note: summarize(r) });
          return { role: "tool" as const, tool_call_id: callId, content: text };
        } catch (e) {
          const msg = (e as Error).message;
          env.pool.add({ id: evId, name, args, ok: false, refs: [], text: "" });
          env.emit({ type: "tool", id: evId, name, args, status: "error", summary: msg });
          env.tracer.add({ role: label, action: "tool", tool: name, args_summary: JSON.stringify(args), ms: Date.now() - t0, ok: false, note: msg });
          return { role: "tool" as const, tool_call_id: callId, content: `Error: ${msg}` };
        }
      }));
      messages.push(...results);
      continue;
    }

    const j = extractJson<{ findings?: unknown; gaps?: unknown }>(res.content);
    if (j && Array.isArray(j.findings)) {
      const findings = (j.findings as unknown[]).map((f) => normalizeFinding(f, i.fallbackProject, label)).filter((f): f is Finding => f !== null).slice(0, 5);
      const gaps = Array.isArray(j.gaps) ? (j.gaps as unknown[]).map((g) => String(g).slice(0, 240)).slice(0, 4) : [];
      env.tracer.add({ role: label, action: "findings", ok: true, note: `${findings.length} finding(s) after ${calls} tool call(s)` });
      return { findings, gaps };
    }
    if (!nudged) {
      nudged = true;
      messages.push({ role: "user", content: 'Reply now with ONLY the JSON object described in your instructions: {"findings":[...],"gaps":[...]}. No other text.' });
      continue;
    }
    break;
  }
  env.tracer.add({ role: label, action: "findings", ok: false, note: "no usable findings returned" });
  return { findings: [], gaps: ["The Investigator did not return usable findings."] };
}
