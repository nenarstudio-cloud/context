# Context
A decision support agent for nonprofits. It combines current data (budgets, operations, surveys) with past records (reports, lessons learned, earlier decisions), explains what is happening with cited evidence, and remembers approved decisions.

## How it works
Planner, Investigators, Evaluator (critic), Reporter. The Evaluator checks every claim against its cited evidence and sends findings back for revision. Runs log a full trace.

## Stack
TypeScript agent and tools, Postgres (operational data), Zetaris (local), Meterless H-MEM and World Model, NVIDIA Nemotron 3 Ultra and 3.5 Lightning through the OpenAI compatible API.

## Zetaris
Zetaris runs locally in Docker. Our Postgres is registered as a datasource, and nine core tables are readable and counted through it. The agent currently reads from the operational database. Routing all reads through Zetaris is future work.

## Setup
1. Copy .env.example to .env and set MODEL_BASE_URL, MODEL_API_KEY and model names.
2. docker compose up -d
3. npm install
4. npm start, then open the printed address.
Run npm run eval for the 45 checks. Set SAMPLE_MODE=true for a run without a model [confirm this works before keeping this line].

## Data
Synthetic and fictional: Amani Foundation, 9 projects, 89 documents, 373 survey rows.
