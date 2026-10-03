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
