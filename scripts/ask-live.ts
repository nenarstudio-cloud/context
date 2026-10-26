// Ask one question through the live four role team from the command line. Run: npm run ask:live -- "your question"
// Add --dry to run without storing proposed decisions. Needs MODEL_BASE_URL, MODEL_API_KEY and NEMOTRON_MODEL (in .env or the environment).
import { createRuntime, seed } from "../src/runtime.ts";
import { runTeam } from "../src/agent/orchestrator.ts";
import { llmProvider, llmLabel } from "../src/config.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const question = args.filter((a) => a !== "--dry").join(" ").trim() || "Why is Turkana Water Access at risk of missing its Q3 milestone?";
if (llmProvider() !== "openai") {
  console.error("Live model not configured. Set MODEL_BASE_URL, MODEL_API_KEY and NEMOTRON_MODEL in .env (and do not set SAMPLE_MODE=true).");
  process.exit(1);
}
const { ctx, close } = await createRuntime({ dryRun: dry });
try {
  await seed(ctx);
  const fast = process.env.NEMOTRON_FAST_MODEL;
  console.log(`live \u00b7 ${llmLabel()}${fast ? ` (fast steps: ${fast})` : ""}${dry ? " \u00b7 dry run" : ""}`);
  console.log(`question: ${question}\n`);
  const r = await runTeam(question, ctx, {
    emit: (e) => {
      if (e.type === "role" && e.status !== "running") console.log(`[${e.role}] ${e.status}${e.note ? ": " + e.note : ""}`);
      if (e.type === "tool" && e.status === "error") console.log(`  tool ${e.name} failed: ${e.summary ?? ""}`);
    },
  });
  console.log(`\n${r.answer}`);
  console.log(`\n--- ${r.findings} finding(s) kept, ${r.dropped} dropped, ${r.rounds} revision round(s), ${r.decisions} decision(s) proposed, critic ${r.criticRan ? "ran" : "unavailable"}, ${Math.round(r.ms / 1000)}s`);
  console.log(`trace: ${r.tracePath ?? "not saved"}`);
} catch (e) {
  console.error("Team run failed:", (e as Error).message);
  const id = (e as { runId?: string }).runId;
  if (id) console.error(`trace: .context-state/traces/${id}.json`);
  process.exitCode = 1;
} finally {
  await close();
}
