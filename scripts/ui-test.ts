// End-to-end UI test: real server (ephemeral state, replay mode), real Postgres, UI script run in jsdom.
// Run: ANTHROPIC_API_KEY= npm run ui-test
import { JSDOM } from "jsdom";
import { startServer } from "../server/index.ts";

let failed = 0, total = 0;
const check = (n: string, ok: boolean, d = "") => { total++; if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? "  " + d : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(50); } return false; }

const s = await startServer({ port: 0, ephemeral: true });
const base = `http://127.0.0.1:${s.port}`;
try {
  const dom = await JSDOM.fromURL(base + "/", {
    runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w: any) { w.fetch = (u: string, o?: any) => fetch(new URL(u, base), o); w.TextDecoder = TextDecoder; w.alert = (m: string) => { throw new Error("alert: " + m); }; },
  });
  const w: any = dom.window, d = w.document, $ = (q: string) => d.querySelector(q);
  check("page boots and shows mode and org date", await until(() => /REPLAY/.test($("#mode").textContent) && /2026-07-06/.test($("#asof").textContent)));
  check("suggested questions rendered", d.querySelectorAll(".sug").length === 4);

  // Ask the Turkana question
  d.querySelectorAll(".sug")[0].click();
  check("answer renders", await until(() => !$("#answer").hidden && /Recommended actions/.test($("#answer").textContent)));
  check("replay notice is shown (no model)", /Replay mode/.test($("#notice").textContent));
  check("tool timeline shows parallel investigators, all ok", d.querySelectorAll(".step").length >= 12 && d.querySelectorAll(".step .dot.ok").length === d.querySelectorAll(".step").length, String(d.querySelectorAll(".step").length));
  const docPills = [...d.querySelectorAll("#answer button.pill")].map((b: any) => b.textContent);
  check("answer has clickable document citations", docPills.length >= 4 && docPills.every((t: string) => /^doc-\d{3}#\d+$/.test(t)), docPills.join(","));
  check("answer has data citations", d.querySelectorAll("#answer .pill.data").length >= 4);
  check("answer text contains grounded numbers (81%, 16 days, 35 days, 11 days)", ["81%", "16 days", "35 days", "11 days"].every((x) => $("#answer").textContent.includes(x)));
  check("answer has no undefined or empty placeholders", !/undefined|null|NaN/.test($("#answer").textContent));
  check("field evidence cites the Lokichar site visit (doc-003) and the 2025 case (doc-002)", docPills.some((t: string) => t.startsWith("doc-003")) && docPills.some((t: string) => t.startsWith("doc-002")), docPills.join(","));
  check("no raw HTML injected (answer built with text nodes)", !$("#answer").innerHTML.includes("<script"));

  // Citation opens the evidence drawer with the real paragraph
  (d.querySelector("#answer button.pill") as any).click();
  check("clicking a citation opens the drawer with the source paragraph", await until(() => $("#drawer").classList.contains("on") && $("#dbody .para") && $("#dbody").textContent.length > 80), $("#dbody").textContent.slice(0, 70));

  // Decisions: 3 proposed, approve one, memory updated
  await until(() => !$("#pend").hidden);
  check("pending badge shows 3", $("#pend").textContent === "3", $("#pend").textContent);
  d.querySelector('#nav button[data-v="decisions"]').click();
  check("decisions screen lists 3 pending cards (+2 seeded history hidden? shows all)", await until(() => d.querySelectorAll("#decs .dec").length >= 3));
  const pendingCards = [...d.querySelectorAll("#decs .dec")].filter((c: any) => c.querySelector(".status.Pending"));
  check("3 pending cards with approve, defer, reject", pendingCards.length === 3 && pendingCards.every((c: any) => c.querySelectorAll(".btns button").length === 3));
  const before = s.ctx.memory.recall("Leadership approved the proposal pre-notify Global Resilience Fund").length;
  (pendingCards[0] as any).querySelector(".btns input").value = "Do it before the 20 July call";
  (pendingCards[0] as any).querySelector(".btns .ok").click();
  check("approving updates the badge to 2", await until(() => $("#pend").textContent === "2"));
  const rows = await s.ctx.writer.list("Approved");
  check("approval stored in ops.decisions with as-of date and note", rows.some((r: any) => r.decided_at === "2026-07-06" && /20 July/.test(String(r.outcome))));
  const mem = s.ctx.memory.recall("Leadership approved proposal");
  check("approval became organizational memory (H-MEM)", mem.some((m) => /Leadership approved the proposal/.test(m.content) && m.origin === "manual"), String(before));
  const again = await fetch(`${base}/api/decisions/${rows[0].decision_id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Rejected" }) });
  check("an already decided proposal cannot be changed (409)", again.status === 409);

  // Graph screen
  d.querySelector('#nav button[data-v="graph"]').click();
  check("graph draws nodes and edges for Turkana Water", await until(() => d.querySelectorAll("#svg .node").length >= 20 && d.querySelectorAll("#svg line").length >= 20), `${d.querySelectorAll("#svg .node").length} nodes`);
  const types = new Set([...d.querySelectorAll("#svg .node")].map((n: any) => n.getAttribute("aria-label").split(":")[0]));
  check("graph includes findings, decisions, documents, people, donor", ["project", "finding", "decision", "document", "person", "donor"].every((t) => types.has(t)), [...types].join(","));
  const finding = [...d.querySelectorAll("#svg .node")].find((n: any) => n.getAttribute("aria-label").startsWith("finding:")) as any;
  finding.dispatchEvent(new w.Event("click"));
  check("selecting a finding shows its statement and evidence paragraphs", await until(() => $("#panel").textContent.includes("evidenced") || $("#panel .para")), $("#panel").textContent.slice(0, 60));

  // Second question: Garissa, plus a question replay does not understand
  d.querySelector('#nav button[data-v="ask"]').click();
  $("#q").value = "What is the weather in Paris?"; $("#go").click();
  check("unsupported question in replay mode is answered honestly", await until(() => /only understands these questions/.test($("#answer").textContent)));
  $("#q").value = "Why is Garissa Maternal Health burning budget faster than it delivers?"; $("#go").click();
  check("Garissa answer cites the 2024 pilot precedent and the 125% travel line", await until(() => /125%/.test($("#answer").textContent) && /doc-011/.test($("#answer").textContent)));

  // API hardening
  const bad = await fetch(`${base}/api/graph?project=pr1'%3BDROP`); check("graph rejects malformed project id", bad.status === 400);
  const ev = await (await fetch(`${base}/api/evidence?refs=${encodeURIComponent("doc-001#1' OR '1'='1")}`)).json(); check("evidence rejects malformed refs (empty result)", Array.isArray(ev) && ev.length === 0);
  const bad2 = await fetch(`${base}/api/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" }); check("ask rejects invalid JSON", bad2.status === 400);
} finally {
  await (s.ctx.writer as any).deleteByCreator("context-agent");
  await s.stop();
}
console.log(`\n${total - failed}/${total} UI checks passed`);
process.exit(failed ? 1 : 0);
