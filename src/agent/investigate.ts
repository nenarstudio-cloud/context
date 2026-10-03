import Anthropic from "@anthropic-ai/sdk";
import { config, llmProvider, llmSettings } from "../config.ts";
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
export async function investigateAnthropic(question: string, ctx: ToolContext, opts: { maxTurns?: number; client?: Anthropic; onEvent?: (e: AgentEvent) => void } = {}): Promise<InvestigationResult> {
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

type OpenAIToolCall = { id?: string; type?: string; function: { name: string; arguments: string } };
type OpenAIMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: OpenAIToolCall[]; tool_call_id?: string };

async function chat(url: string, key: string, body: unknown, retryDelayMs: number): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    if (res.ok) return res.json();
    if ([429, 502, 503, 504].includes(res.status) && attempt < 2) { await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1))); continue; }
    throw new Error(`model API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/**
 * Same investigation loop for any OpenAI-compatible chat API (xAI, NVIDIA, OpenRouter, Gemini's compatibility
 * endpoint, a local Ollama...). Tool calls in one turn run in parallel. Not verified against any real provider:
 * covered by scripts/llm-test.ts against a mock server that speaks the same protocol.
 */
export async function investigateOpenAI(question: string, ctx: ToolContext, opts: { maxTurns?: number; onEvent?: (e: AgentEvent) => void; baseUrl?: string; apiKey?: string; model?: string; retryDelayMs?: number } = {}): Promise<InvestigationResult> {
  const l = llmSettings();
  const baseUrl = opts.baseUrl ?? l.baseUrl, apiKey = opts.apiKey ?? l.apiKey, model = opts.model ?? l.model;
  const tools = anthropicTools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const messages: OpenAIMessage[] = [{ role: "system", content: SYSTEM_PROMPT(ctx.asOf) }, { role: "user", content: question }];
  const trace: InvestigationResult["toolCalls"] = [];
  const maxTurns = opts.maxTurns ?? 10;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const data = await chat(`${baseUrl}/chat/completions`, apiKey, { model, messages, tools, tool_choice: "auto", max_tokens: 4096 }, opts.retryDelayMs ?? 1500);
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new Error("model API returned no message");
    const calls: OpenAIToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    messages.push({ role: "assistant", content: msg.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) {
      const answer = String(msg.content ?? "").trim();
      opts.onEvent?.({ type: "answer", text: answer });
      return { answer, turns: turn, toolCalls: trace };
    }
    const results = await Promise.all(calls.map(async (c, i) => {
      const id = c.id ?? `call_${turn}_${i}`; const name = c.function?.name ?? "";
      let args: Record<string, unknown> = {};
      opts.onEvent?.({ type: "tool", id, name, args: c.function?.arguments, status: "running" });
      try {
        try { args = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { throw new Error("tool arguments were not valid JSON"); }
        const r = await runTool(name, args, ctx);
        trace.push({ name, args, ok: true, refs: r.refs });
        opts.onEvent?.({ type: "tool", id, name, args, status: "ok", summary: summarize(r), refs: r.refs.slice(0, 12) });
        return { role: "tool" as const, tool_call_id: id, content: JSON.stringify(r).slice(0, 24000) };
      } catch (e) {
        trace.push({ name, args, ok: false, refs: [] });
        opts.onEvent?.({ type: "tool", id, name, args, status: "error", summary: (e as Error).message });
        return { role: "tool" as const, tool_call_id: id, content: `Error: ${(e as Error).message}` };
      }
    }));
    messages.push(...results);
  }
  return { answer: "Stopped: turn limit reached before a final answer.", turns: maxTurns, toolCalls: trace };
}

/** Picks the configured model provider. */
export async function investigate(question: string, ctx: ToolContext, opts: { maxTurns?: number; client?: Anthropic; onEvent?: (e: AgentEvent) => void } = {}): Promise<InvestigationResult> {
  const p = llmProvider();
  if (p === "anthropic") return investigateAnthropic(question, ctx, opts);
  if (p === "openai") return investigateOpenAI(question, ctx, opts);
  throw new Error("no model configured: set ANTHROPIC_API_KEY, or LLM_BASE_URL + LLM_API_KEY + LLM_MODEL");
}
