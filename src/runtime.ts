import { config } from "./config.ts";
import { PgDirectPort } from "./adapters/pg-direct.ts";
import { ZetarisDataPort } from "./adapters/zetaris.ts";
import { T } from "./tools/sql.ts";
import type { DataPort } from "./ports.ts";
import { MeterlessContext } from "./context/meterless.ts";
import type { ToolContext } from "./tools/index.ts";

export async function createRuntime(o: { dryRun?: boolean; ephemeral?: boolean; actor?: string } = {}) {
  // pgPort is the one WRITE path (approvals). In direct mode it also serves the reads; in zetaris mode every read goes through Zetaris.
  const pgPort = new PgDirectPort(config.databaseUrl);
  const data: DataPort = config.mode === "zetaris" ? new ZetarisDataPort() : pgPort;
  const asOf = String((await data.query(`SELECT value FROM ${T.ops("meta")} WHERE key = 'as_of_date'`))[0].value);
  const memory = new MeterlessContext({ asOf, stateDir: config.stateDir, ephemeral: o.ephemeral });
  const ctx: ToolContext = { data, writer: pgPort, memory, asOf, dryRun: o.dryRun ?? false, actor: o.actor ?? "context-agent", findingIds: [] };
  return { ctx, close: () => pgPort.close() };
}

/** Load the base graph and organizational lessons from the data port. Idempotent for the graph (stable ids). */
export async function seed(ctx: ToolContext) {
  const q = (s: string) => ctx.data.query(s);
  const [donors, people, projects, staff, documents, chunks] = await Promise.all([
    q(`SELECT donor_id, name, country FROM ${T.ops("donors")}`), q(`SELECT person_id, full_name, role, county, contract_end_date FROM ${T.ops("people")}`),
    q(`SELECT project_id, name, county, donor_id, theme, status FROM ${T.ops("projects")}`), q(`SELECT project_id, person_id FROM ${T.ops("project_staff")}`),
    q(`SELECT doc_id, title, doc_type, project_id, created_on FROM ${T.docs("documents")}`), q(`SELECT chunk_id, doc_id, text FROM ${T.docs("document_chunks")}`),
  ]);
  await ctx.memory.seedGraph({ donors, people, projects, staff, documents });
  await ctx.memory.seedDecisions(await ctx.writer.list());
  const docsById = new Map(documents.map((d) => [String(d.doc_id), d]));
  const lessons = ctx.memory.seedLessons(chunks, docsById);
  return { entitiesAndEdges: ctx.memory.stats(), lessonsLearned: lessons };
}
