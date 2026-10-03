// The two seams that keep the platform scalable. Everything above these interfaces
// (tools, agent loop, UI) never knows which engine sits below.
export type Row = Record<string, unknown>;

/** Read path. Production: Zetaris (one SQL endpoint over Postgres, S3 and the survey API). */
export interface DataPort {
  readonly mode: string;
  query(sql: string): Promise<Row[]>;
}

/** The only write path in the platform: agent proposals land in ops.decisions as Pending. */
export interface DecisionWriter {
  propose(input: { projectId: string; title: string; rationale: string; evidenceRefs: string[]; createdBy: string; createdAt: string }): Promise<{ decisionId: string }>;
  deleteByCreator(createdBy: string): Promise<number>;
  list(status?: string): Promise<Row[]>;
  decide(i: { decisionId: string; status: "Approved" | "Rejected" | "Deferred"; decidedBy: string; decidedAt: string; outcome: string | null }): Promise<Row | null>;
}
