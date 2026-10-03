# Hackathon plan (Oct 15 to 20, 2026)

Registration closes **Oct 13, 00:00 UTC**. Submissions close **Oct 20, 23:45 UTC**. Results Oct 30.

## Before Oct 13
- [ ] Register at hackathon.genai.works (one sign-up covers the event and Discord).
- [ ] Join the Discord. Ask: (1) are model credits provided by sponsors (NVIDIA, xAI)? (2) is a project built before Oct 15 allowed in a main track, or must we use the Wildcard [Tinkerer] track? (3) what must a submission contain?
- [ ] Read rules sections 02 to 07 on the event page (Teams, Tracks, Build window, What you can use, Submission requirements, Judging). They are collapsed behind the plus signs.

## Oct 15 to 17: connect the sponsors
- [ ] Zetaris: launch a cluster, register Supabase (Postgres), an S3 bucket with the two Parquet files, and the Kobo API (`/kobo`, token in KOBO_TOKEN). Send the workspace screenshots so the adapter can be written.
- [ ] Switch `DATA_MODE` to Zetaris. Re-run the golden questions.
- [ ] Meterless: already inside the app (H-MEM memory and World Model graph). Make the Evidence and graph screen show it clearly.

## Oct 18 to 20: make it demo-ready
- [ ] Live model on. Run the 7 golden questions, tune `src/agent/prompt.ts`.
- [ ] Reset test decisions (SQL in the chat), warm the free Render instance before every demo.
- [ ] Record a 3 minute demo: question, investigation, cited answer, graph, approve a decision, ask again and show it remembers.
- [ ] Submit before Oct 20, 23:45 UTC. Do not wait for the last hour.
