// Registers the local Postgres in Zetaris so the agent can read it through Zetaris, then verifies every table.
// Run once (Zetaris must be running, and the Postgres container reachable from it as "context-db"):
//   docker network connect --alias context-db zetaris_default context-postgres-1
//   npm run zetaris:register
// It tries the documented registration forms, finds the one your Zetaris accepts, and prints the .env lines to use.
import { zetarisRunSql, zetarisRestSettings } from "../src/adapters/zetaris.ts";
import { config } from "../src/config.ts";

const ds = process.env.ZETARIS_DATASOURCE ?? "ctxpg";
const db = new URL(config.databaseUrl);
const host = process.env.ZETARIS_PG_HOST ?? "context-db";
const dbName = db.pathname.replace(/^\//, "") || "context";
const jdbc = `jdbc:postgresql://${host}:${db.port || 5432}/${dbName}`;
const opts = `jdbcdriver "org.postgresql.Driver", jdbcurl "${jdbc}", username "${decodeURIComponent(db.username)}", password "${decodeURIComponent(db.password)}"`;

const TABLES: Record<string, string[]> = {
  ops: ["meta", "donors", "people", "projects", "project_staff", "v_project_health", "v_budget_by_line", "v_pending_procurement", "v_open_vacancies", "v_contract_expiry", "v_upcoming_deadlines", "v_projects_without_maintenance", "v_travel_by_quarter"],
  docs: ["documents", "document_chunks"],
  kobo: ["kobo_submissions", "kpi_definitions"],
};

const run = zetarisRunSql(zetarisRestSettings());
const short = (e: unknown) => String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 260);
const exists = (m: string) => /already exist|exists/i.test(m);
const attempt = async (label: string, sql: string) => {
  try { const rows = await run(sql); console.log(`ok   ${label}`); return { ok: true as const, rows }; }
  catch (e) { const m = short(e); console.log(`${exists(m) ? "ok  " : "FAIL"} ${label}${exists(m) ? " (already there)" : ": " + m}`); return { ok: exists(m), rows: [] as Record<string, unknown>[], error: m }; }
};

console.log(`Zetaris datasource "${ds}" -> ${jdbc} (user ${decodeURIComponent(db.username)})\n`);
const created = await attempt(`create datasource ${ds}`, `CREATE DATASOURCE ${ds} DESCRIBE BY "PostgreSQL" OPTIONS (${opts}, fetchsize "1000")`);
if (!created.ok) { console.log("\nCould not create the datasource. Send me the message above."); process.exit(1); }

const listed = await attempt("list tables Zetaris can see in the database", `LIST DATABASE TABLES OPTIONS (${opts})`);
if (listed.ok) console.log("     " + JSON.stringify(listed.rows.slice(0, 6)).slice(0, 400) + (listed.rows.length > 6 ? ` ... (${listed.rows.length} rows)` : ""));

// Find the registration form and the naming style that work, using one table.
const forms = [(s: string, t: string) => `'${s}.${t}'`, (_s: string, t: string) => `'${t}'`];
const styles: ("plain" | "schema")[] = ["plain", "schema"];
const q = (style: "plain" | "schema", s: string, t: string) => (style === "schema" ? `${ds}.${s}.${t}` : `${ds}.${t}`);
let form = 0, style: "plain" | "schema" | null = null;
console.log("");
for (let f = 0; f < forms.length && !style; f++) {
  const reg = await attempt(`register ${forms[f]("ops", "projects")}`, `REGISTER DATASOURCE TABLE ${forms[f]("ops", "projects")} FROM ${ds}`);
  if (!reg.ok) continue;
  for (const st of styles) {
    const t = await attempt(`query ${q(st, "ops", "projects")}`, `SELECT project_id FROM ${q(st, "ops", "projects")} LIMIT 2`);
    if (t.ok && t.rows.length) { form = f; style = st; break; }
  }
}
if (!style) { console.log("\nNo registration form worked. Send me the lines above."); process.exit(1); }
console.log(`\nUsing registration form ${form + 1} and table style "${style}"\n`);

let bad = 0;
for (const [schema, tables] of Object.entries(TABLES)) {
  for (const t of tables) {
    if (!(schema === "ops" && t === "projects")) await attempt(`register ${schema}.${t}`, `REGISTER DATASOURCE TABLE ${forms[form](schema, t)} FROM ${ds}`);
    const c = await attempt(`count   ${q(style, schema, t)}`, `SELECT count(*) AS n FROM ${q(style, schema, t)}`);
    if (c.ok) console.log(`     ${c.rows[0] ? Object.values(c.rows[0])[0] : "?"} rows`); else bad++;
  }
}
console.log(bad ? `\n${bad} table(s) could not be read. Send me the FAIL lines above.` : "\nAll tables are readable through Zetaris.");
console.log("\nPut these lines in your .env:\nDATA_MODE=zetaris\nZETARIS_DATASOURCE=" + ds + "\nZETARIS_TABLE_STYLE=" + style);
