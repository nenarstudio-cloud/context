import pg from "pg";
import type { DataPort, DecisionWriter, Row } from "../ports.ts";

// Dates as plain yyyy-mm-dd strings (no timezone surprises), numerics as numbers.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(1700, (v: string) => parseFloat(v));
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));

export class PgDirectPort implements DataPort, DecisionWriter {
  readonly mode = "direct";
  private pool: pg.Pool;
  constructor(url: string) {
    // Supabase and most hosted Postgres need TLS. DATABASE_SSL=no-verify enables it without certificate pinning.
    const ssl = process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined;
    this.pool = new pg.Pool({ connectionString: url, max: 4, ssl });
  }
  async query(sql: string): Promise<Row[]> {
    const r = await this.pool.query(sql);
    return r.rows as Row[];
  }
  async propose(i: { projectId: string; title: string; rationale: string; evidenceRefs: string[]; createdBy: string; createdAt: string }) {
    const id = `dec-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    await this.pool.query(
      `INSERT INTO ops.decisions (decision_id, project_id, title, status, created_by, created_at, rationale, evidence_refs)
       VALUES ($1,$2,$3,'Pending',$4,$5,$6,$7)`,
      [id, i.projectId, i.title, i.createdBy, i.createdAt, i.rationale, i.evidenceRefs.join(",")]);
    return { decisionId: id };
  }
  async deleteByCreator(createdBy: string) {
    const r = await this.pool.query(`DELETE FROM ops.decisions WHERE created_by = $1`, [createdBy]);
    return r.rowCount ?? 0;
  }
  async list(status?: string) {
    const r = await this.pool.query(
      `SELECT d.decision_id, d.project_id, p.name AS project, d.title, d.status, d.created_by, d.created_at, d.decided_by, d.decided_at, d.outcome, d.rationale, d.evidence_refs
       FROM ops.decisions d LEFT JOIN ops.projects p USING (project_id)
       ${status ? "WHERE d.status = $1" : ""} ORDER BY (d.status = 'Pending') DESC, d.created_at DESC, d.decision_id`, status ? [status] : []);
    return r.rows as Row[];
  }
  async decide(i: { decisionId: string; status: string; decidedBy: string; decidedAt: string; outcome: string | null }) {
    const r = await this.pool.query(
      `UPDATE ops.decisions SET status = $2, decided_by = $3, decided_at = $4, outcome = $5
       WHERE decision_id = $1 AND status = 'Pending' RETURNING decision_id, project_id, title, status`,
      [i.decisionId, i.status, i.decidedBy, i.decidedAt, i.outcome]);
    return (r.rows[0] as Row) ?? null;
  }
  async close() { await this.pool.end(); }
}
