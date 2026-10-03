// Tests the OpenAI-compatible model path against a mock server that speaks the same protocol
// (so it needs no API key). It scripts a model that plans, calls tools in parallel, records a finding,
// proposes a decision and answers. Run: npm run llm-test
import http from "node:http";
import { createRuntime, seed } from "../src/runtime.ts";
import { investigateOpenAI } from "../src/agent/investigate.ts";
import { llmProvider, llmLabel } from "../src/config.ts";

let failed = 0, total = 0;
const check = (n: string, ok: boolean, d = "") => { total++; if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? "  " + d : ""}`); };

type Script = (turn: number, body: any) => { status?: number; message?: any };
function mock(script: Script) {
  const seen: any[] = [];
  const srv = http.createServer((req, res) => {
    let d = ""; req.on("data", (c) => (d += c));
    req.on("end", () => {
      const body = JSON.parse(d); seen.push({ auth: req.headers.authorization, url: req.url, body });
      const r = script(seen.length, body);
      res.writeHead(r.status ?? 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r.status && r.status >= 400 ? { error: "boom" } : { choices: [{ message: r.message }] }));
    });
  });
  return new Promise<{ url: string; seen: any[]; close: () => void }>((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(srv.address() as any).port}/v1`, seen, close: () => srv.close() })));
}
const call = (id: string, name: string, args: unknown) => ({ id, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });

const { ctx, close } = await createRuntime({ ephemeral: true, dryRun: true, actor: "context-agent-llmtest" });
try {
  await seed(ctx);
  // ---- happy path: parallel tool calls, bad args, unknown tool, finding, decision, final answer
  const m = await mock((turn, body) => {
    if (turn === 1) return { message: { role: "assistant", content: null, tool_calls: [
      call("c1", "project_health", { project_id: "pr1" }),
      call("c2", "search_evidence", { project_id: "pr1", terms: ["rain", "standing water"] }),
      call("c3", "project_health", "{not json"),
      call("c4", "does_not_exist", {}),
      call("c5", "project_health", { project_id: "pr1'; DROP TABLE ops.projects;--" }) ] } };
    if (turn === 2) {
      const tools = body.messages.filter((x: any) => x.role === "tool");
      return { message: { role: "assistant", content: "", tool_calls: [
        call("c6", "record_finding", { project_id: "pr1", statement: "Long-rains slip is recurring.", evidence_refs: ["doc-003#1"], confidence: 0.8 }),
        call("c7", "propose_decision", { project_id: "pr1", title: "Pre-notify the donor", rationale: "r", evidence_refs: ["doc-001#3"] }) ] } };
    }
    return { message: { role: "assistant", content: "Answer: it is the seasonal slip. [doc-003#1]" } };
  });
  const events: any[] = [];
  const r = await investigateOpenAI("Why is Turkana Water at risk?", ctx, { baseUrl: m.url, apiKey: "test-key", model: "mock-model", onEvent: (e) => events.push(e) });
  check("final answer is returned", /seasonal slip/.test(r.answer) && r.turns === 3, `${r.turns} turns`);
  check("API key sent as bearer token, correct endpoint and model", m.seen[0].auth === "Bearer test-key" && m.seen[0].url === "/v1/chat/completions" && m.seen[0].body.model === "mock-model");
  check("system prompt carries the as-of date", /2026-07-06/.test(m.seen[0].body.messages[0].content));
  check("all 13 tools are offered in OpenAI function format", m.seen[0].body.tools.length === 13 && m.seen[0].body.tools.every((t: any) => t.type === "function" && t.function.parameters?.type === "object"));
  const t2 = m.seen[1].body.messages;
  const toolMsgs = t2.filter((x: any) => x.role === "tool");
  check("every tool call gets a tool message with the matching id", ["c1", "c2", "c3", "c4", "c5"].every((id) => toolMsgs.some((x: any) => x.tool_call_id === id)));
  check("good calls return data", /Turkana/.test(toolMsgs.find((x: any) => x.tool_call_id === "c1").content) && /doc-003/.test(toolMsgs.find((x: any) => x.tool_call_id === "c2").content));
  check("invalid JSON arguments are reported to the model, not thrown", /not valid JSON/.test(toolMsgs.find((x: any) => x.tool_call_id === "c3").content));
  check("unknown tool is reported to the model", /unknown tool/.test(toolMsgs.find((x: any) => x.tool_call_id === "c4").content));
  check("SQL injection attempt is rejected before the database", /invalid project_id/.test(toolMsgs.find((x: any) => x.tool_call_id === "c5").content));
  check("assistant tool_calls are echoed back to the model", t2.some((x: any) => x.role === "assistant" && x.tool_calls?.length === 5));
  check("finding recorded in memory and graph", ctx.findingIds.length === 1 && ctx.memory.recall("Long-rains slip is recurring").length > 0);
  check("decision proposal honoured the dry run", events.some((e) => e.type === "tool" && e.status === "ok" && /dry run/.test(e.summary ?? "")));
  check("events stream: running then ok/error per tool, then answer", events.filter((e) => e.status === "running").length === 7 && events.filter((e) => e.status === "error").length === 3 && events.at(-1).type === "answer");
  check("projects table intact", Number((await ctx.data.query("SELECT count(*) AS n FROM ops.projects"))[0].n) === 9);
  m.close();

  // ---- provider errors
  const down = await mock(() => ({ status: 500, message: null }));
  let msg = ""; try { await investigateOpenAI("x", ctx, { baseUrl: down.url, apiKey: "k", model: "m" }); } catch (e) { msg = (e as Error).message; }
  check("provider 500 surfaces a clear error (no hang, no retry storm)", /model API error 500/.test(msg) && down.seen.length === 1);
  down.close();
  let n = 0; const flaky = await mock(() => (++n < 3 ? { status: 429, message: null } : { message: { role: "assistant", content: "ok after retries" } }));
  const f = await investigateOpenAI("x", ctx, { baseUrl: flaky.url, apiKey: "k", model: "m", retryDelayMs: 5 });
  check("rate limit (429) is retried and succeeds", f.answer === "ok after retries" && flaky.seen.length === 3);
  flaky.close();
  const loop = await mock(() => ({ message: { role: "assistant", content: null, tool_calls: [call("x", "project_health", {})] } }));
  const lp = await investigateOpenAI("x", ctx, { baseUrl: loop.url, apiKey: "k", model: "m", maxTurns: 3 });
  check("a model that never stops is cut off at the turn limit", /turn limit/.test(lp.answer) && loop.seen.length === 3);
  loop.close();
  const empty = await mock(() => ({ message: undefined }));
  let e2 = ""; try { await investigateOpenAI("x", ctx, { baseUrl: empty.url, apiKey: "k", model: "m" }); } catch (e) { e2 = (e as Error).message; }
  check("empty model response is an error", /no message/.test(e2));
  empty.close();

  // ---- provider selection from the environment
  const save = { ...process.env };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.LLM_BASE_URL; delete process.env.LLM_API_KEY; delete process.env.LLM_MODEL;
  check("no keys means replay mode", llmProvider() === "none" && llmLabel() === null);
  process.env.LLM_BASE_URL = "https://api.example.com/v1/"; process.env.LLM_API_KEY = "k";
  check("base URL and key without a model is still not configured", llmProvider() === "none");
  process.env.LLM_MODEL = "some-model";
  check("base URL, key and model select the OpenAI-compatible provider", llmProvider() === "openai" && llmLabel() === "some-model");
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  check("an Anthropic key takes precedence", llmProvider() === "anthropic");
  Object.assign(process.env, save);
} finally { await close(); }
console.log(`\n${total - failed}/${total} model-path checks passed`);
process.exit(failed ? 1 : 0);
