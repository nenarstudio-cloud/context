import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import { anthropicTools, runTool, type ToolContext } from "../tools/index.ts";

export type AgentEvent =
  | { type: "tool"; id: string; name: string; args: unknown; status: "running" | "ok" | "error"; summary?: string; refs?: string[] }
  | { type: "answer"; text: string };

export interface InvestigationResult {
  answer: string; turns: number;
  toolCalls: { name: string; args: unknown; ok: boolean; refs: string[] }[];
}

/**
 * The investigation loop. The model plans, emits several tool calls per turn, and we run them
 * in parallel (Promise.all): that is the "swarm" of investigators, implemented without any
 * dependency on a specific orchestrator. Needs ANTHROPIC_API_KEY. Not exercised in the offline eval.
 */
export async function investigate(question: string, ctx: ToolContext, opts: { maxTurns?: number; client?: Anthropic; onEvent?: (e: AgentEvent) => void } = {}): Promise<InvestigationResult> {
  const client = opts.client ?? new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const trace: InvestigationResult["toolCalls"] = [];
  const maxTurns = opts.maxTurns ?? 10;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await client.messages.create({
      model: config.model, max_tokens: 4096, system: SYSTEM_PROMPT(ctx.asOf),
      tools: anthropicTools as Anthropic.Tool[], messages,
    });
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      const answer = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      opts.onEvent?.({ type: "answer", text: answer });
      return { answer, turns: turn, toolCalls: trace };
    }
    const results = await Promise.all(uses.map(async (u) => {
      opts.onEvent?.({ type: "tool", id: u.id, name: u.name, args: u.input, status: "running" });
      try {
        const r = await runTool(u.name, (u.input ?? {}) as Record<string, unknown>, ctx);
        trace.push({ name: u.name, args: u.input, ok: true, refs: r.refs });
        opts.onEvent?.({ type: "tool", id: u.id, name: u.name, args: u.input, status: "ok", summary: summarize(r), refs: r.refs.slice(0, 12) });
        return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(r).slice(0, 24000) };
      } catch (e) {
        trace.push({ name: u.name, args: u.input, ok: false, refs: [] });
        opts.onEvent?.({ type: "tool", id: u.id, name: u.name, args: u.input, status: "error", summary: (e as Error).message });
        return { type: "tool_result" as const, tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true };
      }
    }));
    messages.push({ role: "user", content: results });
  }
  return { answer: "Stopped: turn limit reached before a final answer.", turns: maxTurns, toolCalls: trace };
}

export function summarize(r: { rows?: unknown[]; note?: string; [k: string]: unknown }): string {
  if (r.note) return r.note;
  if (r.decision_id) return `proposed decision ${r.decision_id} (Pending)`;
  if (r.memory_id) return "finding recorded in memory and graph";
  return `${r.rows?.length ?? 0} row(s)`;
}
