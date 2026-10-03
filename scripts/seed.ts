// Bootstraps persistent state (graph and organizational lessons). Refuses to run twice unless --force,
// because re-seeding would duplicate lessons and discard recorded findings.
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.ts";
import { createRuntime, seed } from "../src/runtime.ts";
const state = path.resolve(config.stateDir);
if (fs.existsSync(state)) {
  if (!process.argv.includes("--force")) { console.log(`${state} already seeded. Use --force to rebuild (this discards recorded findings).`); process.exit(0); }
  fs.rmSync(state, { recursive: true, force: true });
}
const { ctx, close } = await createRuntime();
console.log("seeded:", await seed(ctx));
await close();
