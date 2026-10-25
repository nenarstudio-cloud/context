// Runtime configuration. Two data modes share one SQL dialect (kept simple enough for Postgres and Trino):
//   direct  : one local Postgres stands in for all three silos (schemas ops, docs, kobo). Dev and tests.
//   zetaris : Zetaris Cloud federates the real silos. Table names gain a catalog prefix.
export type DataMode = "direct" | "zetaris";
export const config = {
  mode: (process.env.DATA_MODE ?? "direct") as DataMode,
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/context",
  // Names you give the three connections in Zetaris. Confirm against your workspace.
  catalogs: {
    pg: process.env.ZETARIS_CATALOG_PG ?? "pg",
    s3: process.env.ZETARIS_CATALOG_S3 ?? "s3",
    kobo: process.env.ZETARIS_CATALOG_KOBO ?? "kobo",
  },
  model: process.env.CONTEXT_MODEL ?? "claude-sonnet-5-5",
  stateDir: process.env.CONTEXT_STATE_DIR ?? ".context-state",
};

/** Scripted answers (no model), even when API keys are present. */
export function isSampleMode(): boolean {
  return process.env.SAMPLE_MODE === "true";
}

/**
 * Which language model runs the investigation. Read lazily from the environment.
 *  anthropic : ANTHROPIC_API_KEY (Claude API)
 *  openai    : any OpenAI-compatible chat API (NVIDIA Nemotron, xAI, OpenRouter, Ollama...)
 *              needs MODEL_BASE_URL (or LLM_BASE_URL), MODEL_API_KEY (or LLM_API_KEY),
 *              and NEMOTRON_MODEL (or LLM_MODEL)
 *  none      : sample / replay mode (scripted, no model)
 */
export type LlmProvider = "anthropic" | "openai" | "none";
export function llmSettings() {
  return {
    baseUrl: (process.env.MODEL_BASE_URL ?? process.env.LLM_BASE_URL ?? "").replace(/\/+$/, ""),
    apiKey: process.env.MODEL_API_KEY ?? process.env.LLM_API_KEY ?? "",
    model: process.env.NEMOTRON_MODEL ?? process.env.LLM_MODEL ?? "",
    fastModel: process.env.NEMOTRON_FAST_MODEL ?? "",
  };
}
export function llmProvider(): LlmProvider {
  if (isSampleMode()) return "none";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  const l = llmSettings();
  return l.baseUrl && l.apiKey && l.model ? "openai" : "none";
}
export function llmLabel(): string | null {
  const p = llmProvider();
  return p === "anthropic" ? config.model : p === "openai" ? llmSettings().model : null;
}
/** True when questions should go through the configured model (not scripted sample/replay). */
export function agentIsLive(): boolean {
  return llmProvider() !== "none";
}
