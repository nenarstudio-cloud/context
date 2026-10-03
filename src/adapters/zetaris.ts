import type { DataPort, Row } from "../ports.ts";

/**
 * Zetaris read adapter. NOT VERIFIED against a live Zetaris workspace.
 * Zetaris exposes an MCP endpoint and SQL access; the transport is not documented in anything I could
 * verify. Inject whatever executes a SQL string against your workspace and returns rows
 * (an MCP tool call, JDBC/Trino HTTP, or a REST call). Nothing else in the platform changes.
 *
 *   const data = new ZetarisDataPort(async (sql) => { ...call Zetaris...; return rows; });
 */
export class ZetarisDataPort implements DataPort {
  readonly mode = "zetaris";
  constructor(private runSql: (sql: string) => Promise<Row[]>) {}
  query(sql: string): Promise<Row[]> { return this.runSql(sql); }
}
