// Zetaris read adapter. Verified against Zetaris's documented REST API (POST /sql-editor/sqls/run):
//   headers  Authorization: Bearer <API key>, X-Org-ID: <organisation id>, X-Request-ID: <fresh uuid>
//   body     { queryId: <uuid>, sql, source: "SqlEditor", limit }
//   reply    { headers: string[], data: string[][], total, timeUsed }
// The agent READS through Zetaris (federated SQL over the registered data sources). Approvals are written
// back to the operational database directly, which is the one write path in the platform (see ports.ts).
import crypto from "node:crypto";
import type { DataPort, Row } from "../ports.ts";

export interface ZetarisRestOptions { url: string; orgId: string; apiKey: string; limit?: number; concurrency?: number; timeoutMs?: number }

/** Settings come from the environment (the .env file): ZETARIS_REST_URL, ZETARIS_ORG_ID, ZETARIS_API_KEY. */
export function zetarisRestSettings(): ZetarisRestOptions {
  const url = (process.env.ZETARIS_REST_URL ?? "").replace(/\/+$/, "");
  const orgId = (process.env.ZETARIS_ORG_ID ?? "1").trim();
  const apiKey = (process.env.ZETARIS_API_KEY ?? "").trim();
  if (!url || !apiKey) throw new Error("Zetaris is not configured: set ZETARIS_REST_URL and ZETARIS_API_KEY (and ZETARIS_ORG_ID) in .env");
  return { url, orgId, apiKey };
}

/** Zetaris returns every value as text. Give numbers, booleans and nulls their real types, as the direct adapter does. */
export function coerce(v: unknown): unknown {
  if (typeof v !== "string") return v;
  if (/^-?\d+(\.\d+)?$/.test(v) && v.length <= 15) return Number(v);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

export function rowsFromReply(reply: { headers?: unknown; data?: unknown }): Row[] {
  const headers = Array.isArray(reply.headers) ? reply.headers.map(String) : [];
  const data = Array.isArray(reply.data) ? (reply.data as unknown[][]) : [];
  return data.map((r) => Object.fromEntries(headers.map((h, i) => [h, coerce(r[i])]))) as Row[];
}

/** Runs one SQL statement through Zetaris. At most `concurrency` run at once (a laptop install has two Spark cores). */
export function zetarisRunSql(o: ZetarisRestOptions = zetarisRestSettings()): (sql: string) => Promise<Row[]> {
  const max = o.concurrency ?? 2;
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = () => (active < max ? (active++, Promise.resolve()) : new Promise<void>((r) => waiting.push(() => { active++; r(); })));
  const release = () => { active--; waiting.shift()?.(); };
  return async (sql: string) => {
    await acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(`${o.url}/sql-editor/sqls/run`, {
            method: "POST",
            headers: { Authorization: `Bearer ${o.apiKey}`, "X-Org-ID": o.orgId, "X-Request-ID": crypto.randomUUID(), "Content-Type": "application/json" },
            body: JSON.stringify({ queryId: crypto.randomUUID(), sql, source: "SqlEditor", limit: o.limit ?? 5000 }),
            signal: AbortSignal.timeout(o.timeoutMs ?? 90_000),
          });
          if (!res.ok) {
            const body = (await res.text()).slice(0, 240);
            if (attempt === 0 && res.status >= 500) continue;
            throw new Error(`Zetaris HTTP ${res.status}: ${body}`);
          }
          return rowsFromReply((await res.json()) as { headers?: unknown; data?: unknown });
        } catch (e) {
          const name = (e as Error).name;
          if (attempt === 0 && (name === "TimeoutError" || name === "AbortError" || (e as Error).message === "fetch failed")) continue;
          throw e;
        }
      }
    } finally {
      release();
    }
  };
}

export class ZetarisDataPort implements DataPort {
  readonly mode = "zetaris";
  constructor(private runSql: (sql: string) => Promise<Row[]> = zetarisRunSql()) {}
  query(sql: string): Promise<Row[]> { return this.runSql(sql); }
}
