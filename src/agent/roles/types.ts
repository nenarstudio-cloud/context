import type { AgentEvent } from "../investigate.ts";
import type { EvidencePool } from "../evidence.ts";
import type { Tracer } from "../trace.ts";

/** Events streamed to the UI. "tool" and "answer" are the original shapes the bridge already understands. */
export type TeamEvent =
  | AgentEvent
  | { type: "role"; id: string; role: string; status: "running" | "ok" | "error"; note?: string }
  | { type: "fallback"; reason: string };

export interface RoleEnv {
  emit: (e: TeamEvent) => void;
  tracer: Tracer;
  pool: EvidencePool;
  deadline: number;
}
