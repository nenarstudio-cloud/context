# Context agent (TypeScript)

Organizational intelligence agent that explains WHY, with evidence from every system, and remembers what it learns.

```
UI  ->  investigate()  ->  tools  ->  DataPort     (reads: Zetaris in production, local Postgres in dev)
                              \->  MeterlessContext (H-MEM memory + World Model evidence graph, local)
                              \->  DecisionWriter   (the only write path: ops.decisions, status Pending)
```

## The UI: your original demo, with the real backend plugged in
`npm start` serves the original demo (`web/demo.html`, byte for byte as designed) at `/`, plus one script (`web/bridge.js`) that connects it to the backend. The compact engineering console is at `/console`.

| Screen in the demo | Status |
|---|---|
| **Ask Context** | **Live.** A "Live investigations" row of chips runs the real agent: investigation timeline in the demo's own chips, cited answer in its advisor layout, click any citation to read the source paragraph. The demo's own four chips still give the original scripted answers unless a model is connected, then every question goes to the agent |
| **Actions** | **Live.** Real proposals from the database appear above the original sample cards. Approve, reject or discuss later is stored and becomes organizational memory. Context never re-proposes something already decided |
| Executive Intelligence, Organizational Pulse, Reports, Relationship Graph, Organizational Memory, Connected Systems, Knowledge Sources, Upload Files, Settings, scenarios | Original sample data, unchanged. Not yet connected, so their numbers (for example 214 projects) do not match the 9 projects in the live dataset |

A pill at the bottom left shows `Live agent` or `Replay`. In **replay mode** (no model connected) four investigations run as a scripted replay: real data lookups, retrieval, memory and graph, but answer text composed from templates. Do not present replay mode as a model.
Model options: `ANTHROPIC_API_KEY` for Claude, or `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` for any OpenAI-compatible provider (xAI, NVIDIA, OpenRouter, Gemini's compatibility endpoint, Ollama).
No per-user authentication: a shared `DEMO_PASSWORD` gates everything.

## Run it
```bash
npm install
# Postgres with the dataset loaded: sql/01..05 from the context-dataset package
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/context
npm run eval                      # offline, no API key, 44 checks across 5 golden questions
npm run demo-test                 # the original demo + bridge end to end, 34 checks
npm run ui-test                   # the compact /console, 27 checks
npm run deploy-test               # password, quotas, Kobo API token, 29 checks
npm run llm-test                  # model loop against a mock OpenAI-compatible server, 22 checks
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
| `investigate()` model loop (Claude or any OpenAI-compatible API) | Written and tested against a mock server that speaks each protocol (22 checks). NOT run against a real model yet: no key was available. Run `npm run ask` and tune `src/agent/prompt.ts` |
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
