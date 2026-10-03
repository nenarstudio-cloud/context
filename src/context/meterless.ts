// The context layer, built on the real Meterless reference engines (vendored, Apache 2.0):
//   H-MEM        organizational memory: lessons from past projects and the agent's own findings,
//                each with confidence, provenance and an append-only trust ledger.
//   World Model  evidence graph: projects, people, donors, documents and findings as entities,
//                with typed, provenance-stamped relationships the UI can draw.
// Everything here runs locally with no network. State persists under stateDir unless ephemeral.
import fs from "node:fs";
import path from "node:path";
import { HMEM } from "../../vendor/hmem/src/index.ts";
import { WorldModel } from "../../vendor/world-model/src/index.ts";
import type { Row } from "../ports.ts";

export interface ContextOptions { asOf: string; stateDir?: string; ephemeral?: boolean }
export interface Recalled { id: string; content: string; relevance: number; origin: string; refs: string[]; confidence: number }
export interface GraphEdge { from: string; type: string; to: string }

export class MeterlessContext {
  readonly hmem: HMEM;
  readonly world: WorldModel;
  private asOf: string;
  private edges: GraphEdge[] = [];
  private entityNames = new Map<string, { type: string; name: string; attrs?: Record<string, unknown> }>();
  private indexFile?: string;

  constructor(o: ContextOptions) {
    this.asOf = o.asOf;
    const asOfMs = Date.parse(`${o.asOf}T00:00:00.000Z`);
    const dir = o.stateDir ?? ".context-state";
    this.hmem = new HMEM({ clock: () => asOfMs, actor: "context-agent", persistDir: o.ephemeral ? undefined : path.join(dir, "hmem") });
    this.world = new WorldModel({
      storage: o.ephemeral ? "memory" : "local", namespace: "context", directory: dir,
      clock: () => new Date(asOfMs),
    });
    // The World Model persists itself; this small index lets us draw the graph after a restart.
    if (!o.ephemeral) {
      fs.mkdirSync(dir, { recursive: true });
      this.indexFile = path.join(dir, "graph-index.json");
      if (fs.existsSync(this.indexFile)) {
        const saved = JSON.parse(fs.readFileSync(this.indexFile, "utf-8"));
        this.edges = saved.edges ?? [];
        this.entityNames = new Map(saved.entities ?? []);
      }
    }
  }

  private persistIndex() {
    if (this.indexFile) fs.writeFileSync(this.indexFile, JSON.stringify({ entities: [...this.entityNames], edges: this.edges }));
  }

  private prov(by: string, kind: "agent" | "api" = "agent") {
    return { kind, by, at: `${this.asOf}T00:00:00.000Z` };
  }

  private async entity(type: string, system: string, id: string, name: string, attrs: Record<string, unknown>, by = "context-agent", kind: "agent" | "api" = "agent") {
    const e = await this.world.upsertEntity({ type, externalKey: { system, id }, name, attrs, source: this.prov(by, kind) });
    this.entityNames.set(e.id, { type, name, attrs });
    return e.id as string;
  }
  private async relate(from: string, type: string, to: string, by = "context-agent", kind: "agent" | "api" = "agent") {
    await this.world.relate({ from, type, to, source: this.prov(by, kind) });
    this.edges.push({ from, type, to });
  }

  /** Build the base graph from ops and documents. Provenance: read through the data port. */
  async seedGraph(d: { donors: Row[]; people: Row[]; projects: Row[]; staff: Row[]; documents: Row[] }) {
    for (const r of d.donors) await this.entity("donor", "ops", String(r.donor_id), String(r.name), { country: r.country }, "data-port", "api");
    for (const r of d.people) await this.entity("person", "ops", String(r.person_id), String(r.full_name), { role: r.role, county: r.county, contract_end_date: r.contract_end_date }, "data-port", "api");
    for (const r of d.projects) {
      const id = await this.entity("project", "ops", String(r.project_id), String(r.name), { county: r.county, status: r.status, theme: r.theme }, "data-port", "api");
      await this.relate(id, "funded-by", `donor:ops:${r.donor_id}`, "data-port", "api");
    }
    for (const r of d.staff) await this.relate(`person:ops:${r.person_id}`, "works-on", `project:ops:${r.project_id}`, "data-port", "api");
    for (const r of d.documents) {
      const id = await this.entity("document", "docs", String(r.doc_id), String(r.title), { doc_type: r.doc_type, created_on: r.created_on }, "data-port", "api");
      if (r.project_id) await this.relate(id, "about", `project:ops:${r.project_id}`, "data-port", "api");
    }
    this.persistIndex();
  }

  /** Rebuild decision state after a fresh start: proposals stay in the graph, human decisions return to memory. */
  async seedDecisions(rows: Row[]) {
    for (const r of rows) {
      const id = String(r.decision_id), pid = String(r.project_id), title = String(r.title), status = String(r.status);
      const did = await this.entity("decision", "ops", id, title, { status }, "data-port", "api");
      await this.relate(`project:ops:${pid}`, status === "Pending" ? "has-pending" : "decided", did, "data-port", "api");
      if (status !== "Pending") this.rememberOutcome({ projectId: pid, decisionId: id, title, status, outcome: r.outcome ? String(r.outcome) : null });
    }
    this.persistIndex();
  }

  /** Teach H-MEM the organization's lessons so they can be recalled across projects. */
  seedLessons(chunks: Row[], docsById: Map<string, Row>) {
    let n = 0;
    for (const c of chunks) {
      const doc = docsById.get(String(c.doc_id));
      if (!doc || !["lessons_learned", "outcomes_survey", "health_check"].includes(String(doc.doc_type))) continue;
      this.hmem.add({
        content: `${doc.title}: ${c.text}`, type: "factual", layer: "long_term",
        tags: [String(doc.doc_type), String(doc.project_id ?? "org")], confidence: 0.9,
        source: `docs:${c.chunk_id}`,
        provenance: { origin: "document", learnedAt: Date.parse(`${this.asOf}T00:00:00.000Z`), label: String(doc.title), refs: [String(c.chunk_id)] },
      });
      n++;
    }
    return n;
  }

  recall(query: string, topN = 5): Recalled[] {
    const res = this.hmem.query(query, { topN, threshold: 0.1 });
    return res.memories.map((r) => ({
      id: r.memory.id, content: r.memory.content, relevance: Math.round(r.relevance * 100) / 100,
      origin: r.memory.provenance.origin, refs: r.memory.provenance.refs ?? [], confidence: r.memory.confidence,
    }));
  }

  /** Record a finding: H-MEM memory (with provenance) plus a graph node linked to the project and its evidence. */
  async rememberFinding(f: { projectId: string; statement: string; evidenceRefs: string[]; confidence: number }) {
    const mem = this.hmem.add({
      content: f.statement, type: "factual", layer: "working", tags: [f.projectId, "finding"], confidence: f.confidence,
      source: "context-agent",
      provenance: { origin: "plan_completion", learnedAt: Date.parse(`${this.asOf}T00:00:00.000Z`), label: "Context investigation finding", refs: f.evidenceRefs },
    });
    const fid = await this.entity("finding", "agent", mem.id, f.statement.slice(0, 80), { statement: f.statement, confidence: f.confidence });
    await this.relate(`project:ops:${f.projectId}`, "exposed-to", fid);
    for (const ref of f.evidenceRefs) {
      const docId = ref.split("#")[0];
      if (/^doc-\d+$/.test(docId)) {
        const did = `document:docs:${docId}`;
        if (this.world.view("graph").entity(did)) await this.relate(fid, "evidenced-by", did);
      }
    }
    this.persistIndex();
    return { memoryId: mem.id as string, entityId: fid };
  }

  async linkDecision(projectId: string, decisionId: string, title: string, findingEntityIds: string[]) {
    const did = await this.entity("decision", "ops", decisionId, title, { status: "Pending" });
    await this.relate(`project:ops:${projectId}`, "has-pending", did);
    for (const f of findingEntityIds) await this.relate(did, "addresses", f);
    this.persistIndex();
    return did;
  }

  /** A human decision becomes organizational memory, so the next investigation can learn what leadership chose. */
  rememberOutcome(o: { projectId: string; decisionId: string; title: string; status: string; outcome: string | null }) {
    return this.hmem.add({
      content: `Leadership ${o.status.toLowerCase()} the proposal "${o.title}" for ${o.projectId}.${o.outcome ? " Note: " + o.outcome : ""}`,
      type: "factual", layer: "long_term", tags: [o.projectId, "decision", o.status.toLowerCase()], confidence: 1,
      source: "human-decision",
      provenance: { origin: "manual", learnedAt: Date.parse(`${this.asOf}T00:00:00.000Z`), label: "Human decision", refs: [`ops.decisions:${o.decisionId}`] },
    }).id as string;
  }

  audit(memoryId: string) { return this.hmem.ledger.history(memoryId); }

  /** Nodes and edges within `depth` hops of an entity, for the Relationship Graph view. */
  neighborhood(entityId: string, depth = 2) {
    const seen = new Set<string>([entityId]); let frontier = [entityId];
    const edges: GraphEdge[] = [];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const e of this.edges) {
        const hit = frontier.includes(e.from) ? e.to : frontier.includes(e.to) ? e.from : null;
        if (!hit) continue;
        edges.push(e);
        if (!seen.has(hit)) { seen.add(hit); next.push(hit); }
      }
      frontier = next;
    }
    return { nodes: [...seen].map((id) => ({ id, ...(this.entityNames.get(id) ?? { type: "?", name: id }) })), edges: [...new Map(edges.map((e) => [`${e.from}|${e.type}|${e.to}`, e])).values()] };
  }

  stats() { return { entities: this.entityNames.size, edges: this.edges.length }; }
}
