// Model client shared by the four roles (Planner, Investigator, Evaluator, Reporter).
// Speaks the OpenAI compatible chat API, which is what NVIDIA Nemotron serves.
// Handles: a run wide time limit, one retry on timeout / 429 / 5xx / network errors,
// reasoning models that put their thinking in a separate field, and errors that never contain a key.
import { llmSettings } from "../config.ts";

export type ToolCall = { id?: string; type?: string; function: { name: string; arguments: string } };
export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
export interface ChatResult { content: string; toolCalls: ToolCall[]; reasoning: string | null; ms: number; model: string }
export interface ChatOptions { model?: string; tools?: unknown[]; toolChoice?: "auto" | "none"; maxTokens?: number; timeoutMs?: number; retryDelayMs?: number; deadline?: number }

export class RunLimitError extends Error {
  constructor() { super("run time limit reached"); this.name = "RunLimitError"; }
}
export class ModelError extends Error {
  status?: number;
  constructor(message: string, status?: number) { super(message); this.name = "ModelError"; this.status = status; }
}

const retryable = (status: number) => status === 429 || (status >= 500 && status <= 599);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "fast" uses NEMOTRON_FAST_MODEL when set, otherwise the main model. */
export function pickModel(kind: "main" | "fast"): string {
  const l = llmSettings();
  return kind === "fast" && l.fastModel ? l.fastModel : l.model;
}

function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => (p && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : "")).join("");
  return "";
}

function reasoningOf(msg: Record<string, unknown>): string | null {
  for (const k of ["reasoning_content", "reasoning", "thinking"] as const) {
    const v = msg[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

export async function chat(messages: ChatMessage[], o: ChatOptions = {}): Promise<ChatResult> {
  const l = llmSettings();
  const model = o.model || l.model;
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (o.deadline && Date.now() > o.deadline) throw new RunLimitError();
    const left = o.deadline ? Math.max(1000, o.deadline - Date.now()) : Infinity;
    const timeout = Math.min(o.timeoutMs ?? 120_000, left);
    try {
      const body: Record<string, unknown> = { model, messages, max_tokens: o.maxTokens ?? 4096 };
      if (o.tools && o.tools.length) { body.tools = o.tools; body.tool_choice = o.toolChoice ?? "auto"; }
      const res = await fetch(`${l.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${l.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) {
        if (attempt === 0 && retryable(res.status)) { await wait(o.retryDelayMs ?? 1500); continue; }
        throw new ModelError(`model API HTTP ${res.status}`, res.status);
      }
      const data = (await res.json()) as { choices?: { message?: Record<string, unknown> }[] };
      const msg = data?.choices?.[0]?.message;
      if (!msg) throw new ModelError("model API returned no message");
      const toolCalls = Array.isArray(msg.tool_calls) ? (msg.tool_calls as ToolCall[]) : [];
      return { content: contentText(msg.content).trim(), toolCalls, reasoning: reasoningOf(msg), ms: Date.now() - started, model };
    } catch (e) {
      if (e instanceof ModelError || e instanceof RunLimitError) throw e;
      if (attempt === 0) { await wait(o.retryDelayMs ?? 1500); continue; }
      const name = e instanceof Error ? e.name : "error";
      throw new ModelError(name === "TimeoutError" || name === "AbortError" ? "model API timed out" : "model API unreachable");
    }
  }
  throw new ModelError("model API request failed");
}

/** Pull the first valid JSON object out of a model reply (handles code fences, think tags and extra prose). */
export function extractJson<T = unknown>(text: string): T | null {
  const cleaned = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  for (let start = cleaned.indexOf("{"); start >= 0; start = cleaned.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) as T; } catch { break; }
      }
    }
  }
  return null;
}

/**
 * Ask for a JSON object. Reasoning models can spend the whole token budget thinking and return empty content,
 * so if no JSON comes back we retry once with a much larger budget and a short reminder.
 */
export async function chatJson<T = unknown>(messages: ChatMessage[], o: ChatOptions & { retryMaxTokens?: number } = {}): Promise<{ res: ChatResult; json: T | null; retried: boolean }> {
  let res = await chat(messages, o);
  let json = extractJson<T>(res.content);
  if (json) return { res, json, retried: false };
  const more = [...messages, { role: "assistant" as const, content: res.content || null }, { role: "user" as const, content: "Reply now with ONLY the JSON object described in your instructions. No other text." }];
  const first = res;
  res = await chat(more, { ...o, maxTokens: o.retryMaxTokens ?? (o.maxTokens ?? 4096) * 2 });
  json = extractJson<T>(res.content);
  res.ms += first.ms;
  res.reasoning = res.reasoning ?? first.reasoning;
  return { res, json, retried: true };
}
