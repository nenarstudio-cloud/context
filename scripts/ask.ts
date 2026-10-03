// Usage: ANTHROPIC_API_KEY=... npm run ask -- "Why is Turkana Water Access at risk of missing its Q3 milestone?"
import fs from "node:fs";
import { config } from "../src/config.ts";
import { createRuntime, seed } from "../src/runtime.ts";
import { investigate } from "../src/agent/investigate.ts";
const question = process.argv.slice(2).join(" ");
if (!question) { console.error("give a question"); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(1); }
// Use persistent state if you ran `npm run seed` (findings accumulate); otherwise a throwaway seeded state.
const persisted = fs.existsSync(config.stateDir);
const { ctx, close } = await createRuntime({ ephemeral: !persisted });
if (!persisted) await seed(ctx);
const r = await investigate(question, ctx);
console.log(r.answer, "\n\n--- trace ---");
for (const t of r.toolCalls) console.log(t.ok ? "ok " : "ERR", t.name, JSON.stringify(t.args));
await close();
