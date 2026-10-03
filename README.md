# Context agent (TypeScript)

Organizational intelligence agent that explains WHY, with evidence from every system, and remembers what it learns.

```
UI  ->  investigate()  ->  tools  ->  DataPort     (reads: Zetaris in production, local Postgres in dev)
                              \->  MeterlessContext (H-MEM memory + World Model evidence graph, local)
                              \->  DecisionWriter   (the only write path: ops.decisions, status Pending)
```

## The UI (three screens)
`npm start` serves http://127.0.0.1:8787 with **Ask** (live investigation timeline, cited answer, click any citation to read the source paragraph), **Evidence and graph** (World Model graph per project: findings, evidencing documents, people, donor, decisions) and **Decisions** (approve, defer or reject; each outcome becomes H-MEM memory).
With `ANTHROPIC_API_KEY` set it runs the live Claude agent. Without it, it runs **replay mode**: real tools, retrieval, memory and graph, but answer text composed from templates for four known questions. The UI labels this clearly. Do not demo replay mode as a model. No authentication: bind to localhost or add auth first.

## Run it
```bash
npm install
# Postgres with the dataset loaded: sql/01..05 from the context-dataset package
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/context
npm run eval                      # offline, no API key, 44 checks across 5 golden questions
npm run ui-test                   # end to end: server + jsdom UI + Postgres, 27 checks
npm start                         # the UI
npm run seed                      # optional: persistent graph and lessons in .context-state
ANTHROPIC_API_KEY=... npm run ask -- "Why is Turkana Water Access at risk of missing its Q3 milestone?"
```

## What is real and what is not
| Piece | Status |
|---|---|
| Tool layer, SQL views, input validation, decision write path | Built, tested against PostgreSQL 16 |
| Meterless H-MEM and World Model | The real Apache-2.0 reference engines, vendored in `vendor/`, tested (provenance, trust ledger, graph, recall) |
| UI (`npm run ui-test`) | 27 checks pass in jsdom against the real server. Never viewed in a real browser: check layout and the graph on screen yourself |
| Offline eval (`npm run eval`) | 44 checks pass. Fixed plans stand in for the model, so it tests tools, retrieval, memory and graph, not model reasoning |
| `investigate()` Claude tool-use loop | Written and typechecked. NOT run live: no API key was available. Run `npm run ask` and tune `src/agent/prompt.ts` |
| Zetaris adapter | A stub (`src/adapters/zetaris.ts`). Inject a `runSql` once you know how your Zetaris workspace is reached. Catalog names and dialect are unverified |
| Meterless Swarms | Not used. It is a separate proprietary product, not part of the open repo. Parallel investigation here is `Promise.all` over the model's tool calls |

## Seams that make it scalable
- `DataPort`: swap local Postgres for Zetaris with no change to tools, agent or UI.
- Tools use plain SQL on governed views (`ops.v_*`). Table names get a catalog prefix in `zetaris` mode (`src/tools/sql.ts`).
- Memory and graph are behind `MeterlessContext`. Findings carry provenance and confidence; decisions link to the findings that justify them.

## Safety rules enforced in code
- Model-supplied ids and keywords are validated or sanitised before they reach SQL (tested with injection attempts).
- The agent can only write proposals (`Pending`). Nothing is executed.
- The agent's "today" is `ops.meta.as_of_date`, never the system clock.
