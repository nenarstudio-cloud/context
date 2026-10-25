// One live question through the real agent (OpenAI-compatible / Nemotron path). Run: npm run llm-live -- "your question"
import fs from "node:fs";
import { agentIsLive, llmLabel, config } from "../src/config.ts";
import { createRuntime, seed } from "../src/runtime.ts";
import { investigate } from "../src/agent/investigate.ts";

const question = process.argv.slice(2).join(" ").trim() || "Why is Turkana Water Access at risk of missing its Q3 milestone?";
if (!agentIsLive()) {
  console.error("Live model not configured. Set MODEL_BASE_URL, MODEL_API_KEY, and NEMOTRON_MODEL (and SAMPLE_MODE≠true).");
  process.exit(1);
}

const persisted = fs.existsSync(config.stateDir);
const { ctx, close } = await createRuntime({ ephemeral: !persisted, actor: "llm-live" });
try {
  if (!persisted) await seed(ctx);
  console.error(`live · ${llmLabel()}\n`);
  const r = await investigate(question, ctx);
  console.log(r.answer);
  console.log("\n--- tools ---");
  for (const t of r.toolCalls) console.log(t.ok ? "ok " : "ERR", t.name, JSON.stringify(t.args));
  if (r.reasoningTrace.length) {
    console.log("\n--- reasoning (trace only) ---");
    for (const chunk of r.reasoningTrace) console.log(chunk.slice(0, 2000) + (chunk.length > 2000 ? "…" : ""));
  }
} finally {
  await close();
}
