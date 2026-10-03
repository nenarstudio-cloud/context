// End to end test of the ORIGINAL demo (web/demo.html, untouched) with the bridge plugged in:
// real server, real Postgres, page run in jsdom. Run: ANTHROPIC_API_KEY= npm run demo-test
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";
import crypto from "node:crypto";
import { startServer } from "../server/index.ts";

let failed = 0, total = 0;
const check = (n: string, ok: boolean, d = "") => { total++; if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? "  " + d : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 9000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (f()) return true; } catch {} await sleep(60); } return false; }
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");

async function open(base: string) {
  const errors: string[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", (e: any) => { if (!/Not implemented/.test(String(e?.message))) errors.push(String(e?.message)); });
  // Inline the bridge so jsdom needs no network (the real page loads it with a script tag, checked separately).
  const html = await (await fetch(base + "/")).text(); const bridge = await (await fetch(base + "/bridge.js")).text();
  const page = html.replace('<script src="/bridge.js"></script>', () => `<script>${bridge}</script>`);
  const dom = new JSDOM(page, {
    url: base + "/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w: any) {
      let jar = "";  // minimal cookie jar so the session cookie works like it does in a browser
      w.fetch = async (u: string, o: any = {}) => { const r = await fetch(new URL(u, base), { ...o, headers: { ...(o.headers ?? {}), ...(jar ? { Cookie: jar } : {}) } }); const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) jar = sc[0].split(";")[0]; return r; }; w.TextDecoder = TextDecoder; w.alert = (m: string) => { throw new Error("alert: " + m); };
      w.Element.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }; w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    },
  });
  return { w: dom.window as any, errors };
}

const orig = fs.readFileSync(new URL("../web/demo.html", import.meta.url));
check("web/demo.html is byte-identical to the uploaded original demo", sha(orig) === "8bdcaf93a3ad10e177ec8bcf3398d5f3da2afe8867769328eacdf64bae7dbdef");
const s = await startServer({ port: 0, ephemeral: true, hasKey: false });
const base = `http://127.0.0.1:${s.port}`;
try {
  const served = await (await fetch(base + "/")).text();
  const stripped = served.replace('<script src="/bridge.js"></script>\n', "");
  check("the served page is the original demo plus exactly one script tag", stripped === orig.toString("utf-8"));
  check("the old compact console is still available at /console", (await (await fetch(base + "/console")).text()).includes("Evidence and graph"));

  const { w, errors } = await open(base);
  const d = w.document, $ = (q: string) => d.querySelector(q);
  check("original demo boots with its connect and first screens", await until(() => !!$("#firstscreen") && !!$("#app-shell") && typeof w.handleAsk === "function"));
  check("bridge loaded: mode pill shows replay", await until(() => /Replay/.test($("#ctxb-pill")?.textContent ?? "")));
  check("original sidebar has all 12 sections intact", d.querySelectorAll(".sidebar-item").length >= 11);
  d.getElementById("app-shell").hidden = false; d.getElementById("firstscreen").hidden = true;

  // original scripted behaviour is untouched for the demo's own questions
  w.handleAsk("Which projects worry you?");
  check("original scripted Ask still works exactly as before (watchlist answer)", await until(() => d.querySelectorAll("#answer-stage .answer-watch-item").length > 0, 3000));
  check("original Ask did not use the live agent", !$("#answer-stage #ctxb-steps"));
  w.handleAsk("What have we learned about women entrepreneurship?");
  check("original synthesis answer renders", await until(() => d.querySelectorAll("#answer-stage .answer-points li").length > 0, 3000));

  // live investigation inside the demo's own answer card
  check("live investigation chips are added under the demo's own chips", d.querySelectorAll("#ctxb-livechips .suggestion-chip").length === 4);
  d.querySelectorAll("#ctxb-livechips .suggestion-chip")[0].click();
  check("live answer renders in the demo's answer stage", await until(() => /Recommendation/.test($("#answer-stage").textContent) && !!$("#ctxb-close")));
  const stage = $("#answer-stage");
  check("tool chips use the demo's own source-tag style, all complete", d.querySelectorAll("#ctxb-steps .source-tag").length >= 12 && [...d.querySelectorAll("#ctxb-steps .source-tag")].every((x: any) => /✓/.test(x.textContent)));
  check("grounded numbers appear (81%, 16 days, 35 days, 11 days)", ["81%", "16 days", "35 days", "11 days"].every((x) => stage.textContent.includes(x)));
  check("answer uses the demo's advisor layout (I found, Recommendation, confidence badge, meta row)", /I found/.test(stage.textContent) && !!$("#answer-stage .confidence-badge") && !!$("#answer-stage .answer-meta-row"));
  const cits = [...d.querySelectorAll("#answer-stage .ctxb-cite")].map((b: any) => b.textContent);
  check("document citations are clickable and include the site visit and the 2025 case", cits.length >= 4 && cits.some((c: string) => c.startsWith("doc-003")) && cits.some((c: string) => c.startsWith("doc-002")), cits.join(","));
  check("no undefined or NaN in the answer", !/undefined|NaN|null/.test(stage.textContent));
  (d.querySelector("#answer-stage .ctxb-cite") as any).click();
  check("clicking a citation opens the source paragraph panel", await until(() => $("#ctxb-panel").classList.contains("on") && ($("#ctxb-pbody .para")?.textContent.length ?? 0) > 80));
  $("#ctxb-panel .x").click();

  // Actions: real decisions above the original sample cards
  check("review button appears for the proposed decisions", /Review 3 proposed decisions/.test(stage.textContent));
  $("#ctxb-review").click();
  check("Actions view switches and shows 3 live pending cards (plus the 2 seeded history cards)", await until(() => d.querySelectorAll("#ctxb-live-decisions .decide-card:not(.is-resolved)").length === 3 && d.querySelectorAll("#ctxb-live-decisions .decide-card.is-resolved").length === 2 && $("#view-decide").classList.contains("view-active")));
  check("live cards use the demo's card and button classes", !!$("#ctxb-live-decisions .decide-card .decide-btn.approve") && !!$("#ctxb-live-decisions .decide-btn.reject") && !!$("#ctxb-live-decisions .decide-btn.later"));
  check("the original sample decision cards are still there below", d.querySelectorAll('#decide-list > .decide-card').length >= 1 && /Sample decisions/.test($("#ctxb-sample-head").textContent));
  const sampleCount = d.querySelectorAll('#decide-list > .decide-card').length;
  $("#ctxb-live-decisions .decide-btn.approve").click();
  check("approving writes to the database and updates the card", await until(() => d.querySelectorAll("#ctxb-live-decisions .decide-card:not(.is-resolved)").length === 2 && d.querySelectorAll("#ctxb-live-decisions .decide-status-tag.approved").length === 3));
  const approved = await s.ctx.writer.list("Approved");
  check("approval is stored with the as-of date and became organizational memory", approved.some((r: any) => r.decided_at === "2026-07-06") && s.ctx.memory.recall("Leadership approved the proposal").some((m) => m.origin === "manual"));
  // original sample card still works (original resolveDecision)
  const sampleBtn = d.querySelector('#decide-list > .decide-card .decide-btn.approve') as any; sampleBtn.click();
  check("original sample decision buttons still work", d.querySelectorAll('#decide-list > .decide-card .decide-status-tag.approved').length >= 1 && d.querySelectorAll('#decide-list > .decide-card').length === sampleCount);

  // asking again must not duplicate proposals
  d.querySelector('[data-view="home"]').click();
  w.handleAsk("Why is Turkana Water Access at risk of missing its Q3 milestone?");
  check("asking again completes", await until(() => !!$("#ctxb-close") && /Recommendation/.test($("#answer-stage").textContent)));
  await sleep(300); await w.__ctxb.refreshDecisions();
  const pending = await s.ctx.writer.list("Pending");
  check("repeat questions neither duplicate pending proposals nor re-propose the approved one", pending.length === 2 && (await s.ctx.writer.list()).length === 5, String(pending.length));

  // other live questions
  w.handleAsk("Why is Garissa Maternal Health burning budget faster than it delivers?");
  check("Garissa investigation cites the 2024 pilot and the 125% travel line", await until(() => /125%/.test($("#answer-stage").textContent) && /doc-011/.test($("#answer-stage").textContent)));

  // safety
  const out = w.__ctxb.cites("<img src=x onerror=alert(1)> [doc-001#1] [javascript:alert(1)] [ops.v_project_health:pr1]");
  check("bridge escapes HTML and only links valid references", !/<img/.test(out) && /&lt;img/.test(out) && /data-ref="doc-001#1"/.test(out) && !/data-ref="javascript/.test(out) && /class="ctxb-data"/.test(out));
  const p = w.__ctxb.parseAnswer("Answer: a [doc-001#1]\nEvidence:\n- one\n- two\nRecommended actions:\n1. do it\nConfidence and gaps: fine");
  check("answer parser splits sections", p.structured && p.Evidence.length === 2 && p["Recommended actions"].length === 1 && /fine/.test(p["Confidence and gaps"]));
  check("no script errors from the demo or the bridge", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally { await (s.ctx.writer as any).deleteByCreator("context-agent"); await s.stop(); }

// password gate on the demo page
const s2 = await startServer({ port: 0, ephemeral: true, password: "open sesame", hasKey: false });
try {
  const base2 = `http://127.0.0.1:${s2.port}`; const { w } = await open(base2); const d = w.document;
  check("with a password set, the login overlay covers the demo", await until(() => d.querySelector("#ctxb-login")?.classList.contains("on")));
  check("nothing is exposed before login (pill empty)", (d.querySelector("#ctxb-pill")?.textContent ?? "") === "");
  d.querySelector("#ctxb-pw").value = "wrong"; d.querySelector("#ctxb-go").click();
  check("wrong password shows an error", await until(() => /Wrong password/.test(d.querySelector("#ctxb-err").textContent)));
  d.querySelector("#ctxb-pw").value = "open sesame"; d.querySelector("#ctxb-go").click();
  check("right password removes the overlay and boots the bridge", await until(() => !d.querySelector("#ctxb-login").classList.contains("on") && /Replay/.test(d.querySelector("#ctxb-pill").textContent)));
} finally { await s2.stop(); }
console.log(`\n${total - failed}/${total} demo checks passed`);
process.exit(failed ? 1 : 0);
