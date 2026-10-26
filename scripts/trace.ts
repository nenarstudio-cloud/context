// Print a saved agent trace as a readable log. Run: npm run trace            (newest run)
//                                                 npm run trace -- run-xxxx-yyyyyy   (a specific run)
//                                                 npm run trace -- --list            (recent runs)
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.ts";

const dir = path.join(config.stateDir, "traces");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t) : [];
if (!files.length) { console.log("No traces yet. Run: npm run ask:live"); process.exit(0); }
const arg = process.argv[2];
if (arg === "--list") {
  for (const x of files.slice(0, 15)) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, x.f), "utf-8"));
    console.log(`${x.f.replace(".json", "")}  ${j.mode ?? "?"}  ${j.verdict ?? j.error ?? ""}  ${Math.round((j.ms ?? 0) / 1000)}s  ${String(j.question ?? "").slice(0, 70)}`);
  }
  process.exit(0);
}
const pick = arg ? files.find((x) => x.f === `${arg}.json` || x.f === arg) : files[0];
if (!pick) { console.log("Trace not found. Try: npm run trace -- --list"); process.exit(1); }
const j = JSON.parse(fs.readFileSync(path.join(dir, pick.f), "utf-8"));
console.log(`${j.run_id}  ${j.mode ?? ""}  ${j.verdict ?? ""}  ${Math.round((j.ms ?? 0) / 1000)}s`);
console.log(`question: ${j.question}`);
if (j.rounds !== undefined) console.log(`rounds ${j.rounds}, findings ${j.findings}, dropped ${j.dropped}, decisions ${j.decisions}, critic ${j.critic}`);
console.log("");
for (const e of j.events ?? []) {
  console.log(`${String((e.t / 1000).toFixed(1)).padStart(6)}s  ${String(e.role).padEnd(16)} ${String(e.action).padEnd(9)} ${String(e.tool ?? "").padEnd(18)} ${e.ok ? "ok  " : "FAIL"} ${e.ms ? e.ms + " ms " : ""}${e.note ?? ""}`);
}
