/* Context bridge. Loaded after the original demo (web/demo.html, untouched). It plugs the real backend into
 * the demo's own screens without changing their markup or styling:
 *   Ask Context  -> live investigation (tool timeline, cited answer, evidence panel, proposed decisions)
 *   Actions      -> real decisions from the database (approve, reject, defer), above the original sample cards
 * Everything else in the demo keeps its original sample data. If no backend or no model is available the
 * original scripted behaviour runs exactly as before. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CHUNK = /^doc-\d{3}#\d{1,2}$/, DATAREF = /^(ops|kobo)\.[A-Za-z0-9_.:\-]+$/;
  let META = null;

  /* ---------- styles (tokens come from the demo's own :root) ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .ctxb-cite{font:500 11px var(--mono);padding:1px 7px;margin:0 2px;border-radius:999px;border:0;background:var(--violet-wash);color:var(--violet);cursor:pointer;vertical-align:1px}
  .ctxb-cite:hover{background:var(--violet);color:#fff}
  .ctxb-data{font:500 11px var(--mono);padding:1px 7px;margin:0 2px;border-radius:999px;background:var(--emerald-wash);color:var(--emerald);vertical-align:1px;cursor:help}
  .ctxb-step{opacity:.55}.ctxb-step.ok{opacity:1}.ctxb-step.err{opacity:1;background:var(--rose-wash);color:var(--rose)}
  .ctxb-notice{margin:0 0 14px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--amber-wash);color:#8a5a00;font-size:13px}
  .ctxb-pill{position:fixed;left:14px;bottom:14px;z-index:60;font:500 11px var(--mono);padding:5px 11px;border-radius:999px;background:var(--bg-raised);border:1px solid var(--hairline-strong);color:var(--ink-dim);box-shadow:var(--shadow-md)}
  .ctxb-pill i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:var(--amber)}.ctxb-pill.live i{background:var(--emerald)}.ctxb-pill.sample i{background:var(--amber)}
  .ctxb-livechips{margin-top:12px}.ctxb-livechips .lbl{font:600 11px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin:0 0 8px}
  .ctxb-sec{font:600 12px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin:22px 0 10px}
  .ctxb-sec.sample{color:var(--ink-faint);margin-top:34px}
  .ctxb-tag{font:600 10px var(--mono);padding:2px 7px;border-radius:999px;background:var(--emerald-wash);color:var(--emerald);margin-left:8px;vertical-align:2px}
  .ctxb-refs{margin:8px 0 2px}.ctxb-empty{padding:16px 18px;border:1px dashed var(--hairline-strong);border-radius:var(--radius);color:var(--ink-dim);font-size:14px}
  #ctxb-panel{position:fixed;top:0;right:0;bottom:0;width:min(440px,100%);background:var(--bg-raised);box-shadow:var(--shadow-lg);transform:translateX(105%);transition:transform .25s var(--ease);z-index:9000;overflow:auto;padding:20px}
  #ctxb-panel.on{transform:none}#ctxb-panel .x{float:right;border:0;background:none;font-size:24px;color:var(--ink-dim);cursor:pointer}
  #ctxb-panel .para{margin:12px 0;padding:12px 14px;background:var(--bg-soft);border-radius:var(--radius-sm);font-size:14px;line-height:1.55}
  #ctxb-panel .tg{font:500 11px var(--mono);color:var(--ink-dim);text-transform:uppercase}#ctxb-panel .mt{font:12px var(--mono);color:var(--ink-faint)}
  #ctxb-login{position:fixed;inset:0;z-index:10000;background:var(--bg);display:none;align-items:center;justify-content:center;padding:20px}#ctxb-login.on{display:flex}
  #ctxb-login .box{width:min(380px,100%);background:var(--bg-raised);border:1px solid var(--hairline);border-radius:var(--radius);box-shadow:var(--shadow-md);padding:26px}
  #ctxb-login h2{font:700 22px var(--display);margin:0 0 6px}#ctxb-login p{color:var(--ink-dim);margin:0 0 6px}
  #ctxb-login input{width:100%;padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--hairline-strong);font:inherit;margin:12px 0}
  #ctxb-login button{width:100%;padding:12px;border:0;border-radius:var(--radius-sm);background:var(--blue);color:#fff;font-weight:600;cursor:pointer}
  #ctxb-login .err{color:var(--rose);font-size:13px;min-height:20px}
  .ctxb-role{background:var(--violet-wash);color:var(--violet);font-weight:600}.ctxb-role.err{background:var(--rose-wash);color:var(--rose)}`;
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  function cites(text) {
    return esc(text).replace(/\[([^\]]+)\]/g, (m, inner) => {
      const refs = inner.split(/[,;]\s*/).map((s) => s.trim());
      if (!refs.length || !refs.every((r) => CHUNK.test(r) || DATAREF.test(r))) return m;
      return refs.map((r) => CHUNK.test(r) ? `<button type="button" class="ctxb-cite" data-ref="${r}" title="Open the source paragraph">${r}</button>` : `<span class="ctxb-data" title="Data reference: ${r}">${r.replace(/^ops\.|^kobo\./, "")}</span>`).join("");
    });
  }
  const SECS = ["Answer", "Evidence", "Pattern", "Recommended actions", "Confidence and gaps"];
  function parseAnswer(text) {
    const out = { Answer: "", Evidence: [], Pattern: "", "Recommended actions": [], "Confidence and gaps": "" }; let cur = null, any = false;
    for (const raw of String(text).split("\n")) {
      const line = raw.trim(); if (!line) continue;
      const h = SECS.find((s) => line.startsWith(s + ":") || line.startsWith(s + " ("));
      if (h) { cur = h; any = true; const rest = line.slice(line.indexOf(":") + 1).trim(); if (rest) put(out, cur, rest, false); continue; }
      const li = line.match(/^(?:[-•]|\d+\.)\s+(.*)$/);
      if (cur) put(out, cur, li ? li[1] : line, !!li); else out.Answer += (out.Answer ? " " : "") + line;
    }
    out.structured = any; return out;
  }
  function put(out, sec, text, bullet) {
    if (Array.isArray(out[sec])) out[sec].push(text); else out[sec] += (out[sec] ? " " : "") + text;
  }
  const NAMES = { project_health: "Project health", budget_by_line: "Budget lines", pending_procurement: "Procurement", open_vacancies: "Vacancies", contract_expiry: "Contracts", upcoming_deadlines: "Deadlines", projects_without_maintenance: "Maintenance budgets", travel_by_quarter: "Travel spend", kpi_series: "Field surveys", search_evidence: "Documents", recall_memory: "Organizational memory", record_finding: "Recording finding", propose_decision: "Proposing decision" };
  const label = (e) => { let a = e.args; if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } } return (NAMES[e.name] ?? e.name) + (a && a.project_id ? ` · ${a.project_id}` : a && a.kpi_id ? ` · ${a.kpi_id}` : ""); };

  /* ---------- api and login ---------- */
  const api = async (path, opts) => {
    const r = await fetch(path, opts); const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.login) { showLogin(); throw new Error("login required"); }
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  };
  const login = document.createElement("div"); login.id = "ctxb-login";
  login.innerHTML = `<div class="box"><h2>Context.</h2><p>Enter the demo password to continue.</p><input id="ctxb-pw" type="password" autocomplete="current-password" aria-label="Password"><div class="err" id="ctxb-err"></div><button type="button" id="ctxb-go">Sign in</button></div>`;
  document.body.appendChild(login);
  function showLogin() { login.classList.add("on"); $("#ctxb-pw").focus(); }
  async function doLogin() {
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#ctxb-pw").value }) });
      const j = await r.json(); if (!r.ok) { $("#ctxb-err").textContent = j.error || "Login failed"; return; }
      login.classList.remove("on"); $("#ctxb-pw").value = ""; boot();
    } catch (e) { $("#ctxb-err").textContent = e.message; }
  }
  $("#ctxb-go").onclick = doLogin; $("#ctxb-pw").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  /* ---------- evidence panel ---------- */
  const panel = document.createElement("aside"); panel.id = "ctxb-panel"; panel.setAttribute("aria-label", "Source evidence");
  panel.innerHTML = `<button type="button" class="x" aria-label="Close">×</button><div id="ctxb-pbody"></div>`; document.body.appendChild(panel);
  panel.querySelector(".x").onclick = () => panel.classList.remove("on");
  async function openEvidence(refs) {
    const body = $("#ctxb-pbody"); panel.classList.add("on"); body.textContent = "Loading…";
    try {
      const rows = await api("/api/evidence?refs=" + encodeURIComponent(refs.join(",")));
      body.innerHTML = rows.length ? rows.map((c) => `<div class="para"><div class="tg">${esc(String(c.doc_type).replace(/_/g, " "))} · ${esc(c.created_on)}</div><strong>${esc(c.title)}</strong><div class="mt">${esc(c.project_name || "Organisation-wide")} · ${esc(c.source_system)} · ${esc(c.source_path)}</div><p>${esc(c.text)}</p><div class="mt">${esc(c.chunk_id)}</div></div>`).join("") : "<p>No document found for that reference.</p>";
    } catch (e) { body.textContent = e.message; }
  }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest(".ctxb-cite"); if (b) openEvidence([b.dataset.ref]); });

  /* ---------- live Ask ---------- */
  const origHandleAsk = window.handleAsk;
  let asking = false;
  window.handleAsk = function (question) {
    const real = META && (META.mode === "live" || (META.supported || []).some((q) => q.toLowerCase() === String(question).trim().toLowerCase()));
    if (!real) return origHandleAsk(question);
    return liveAsk(String(question).trim());
  };

  async function liveAsk(question) {
    if (asking) return; asking = true;
    const stage = $("#answer-stage"); stage.hidden = false;
    stage.innerHTML = `<p class="answer-q">"${esc(question)}"</p>
      ${META.mode === "sample" ? `<p class="ctxb-notice">Sample mode: no language model is connected. The data lookups, retrieval, memory and graph are real, but the answer text is composed from templates, not model reasoning.</p>` : ""}
      <p class="answer-intro" id="ctxb-intro">Investigating across operations data, field surveys, documents and organizational memory…</p>
      <p class="answer-advisor-label">I'm analysing</p>
      <div class="answer-sources" id="ctxb-steps" style="margin-bottom:18px;"></div><div id="ctxb-body"></div>`;
    if (stage.scrollIntoView) stage.scrollIntoView({ behavior: "smooth", block: "center" });
    const evidence = new Set(); const findings = []; let lookups = 0, proposed = 0, answerText = "", failed = null, runInfo = null, fellBack = null;
    const roleStep = (e) => {
      let s = document.getElementById("ctxb-r-" + e.id);
      if (!s) { s = document.createElement("span"); s.id = "ctxb-r-" + e.id; $("#ctxb-steps").appendChild(s); }
      const mark = e.status === "ok" ? " ✓" : e.status === "error" ? " ✕" : " …";
      s.textContent = e.role + (e.status !== "running" && e.note ? " · " + e.note : "") + mark;
      s.className = "source-tag ctxb-step ctxb-role" + (e.status === "ok" ? " ok" : e.status === "error" ? " err" : "");
    };
    const step = (e) => {
      let s = document.getElementById("ctxb-s-" + e.id);
      if (!s) { s = document.createElement("span"); s.id = "ctxb-s-" + e.id; s.className = "source-tag ctxb-step"; $("#ctxb-steps").appendChild(s); }
      const mark = e.status === "ok" ? " ✓" : e.status === "error" ? " ✕" : " …";
      s.textContent = label(e) + mark; s.className = "source-tag ctxb-step" + (e.status === "ok" ? " ok" : e.status === "error" ? " err" : "");
      if (e.status === "ok") {
        if (e.name === "record_finding") { let a = e.args; if (a && typeof a.confidence === "number") findings.push(a.confidence); }
        else if (e.name === "propose_decision") proposed++; else lookups++;
        (e.refs || []).forEach((r) => CHUNK.test(r) && evidence.add(r));
      }
    };
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      if (r.status === 401) { showLogin(); throw new Error("login required"); }
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || "request failed");
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (!chunk.startsWith("data: ")) continue;
          const e = JSON.parse(chunk.slice(6));
          if (e.type === "tool") step(e); else if (e.type === "role") roleStep(e); else if (e.type === "fallback") fellBack = e.reason; else if (e.type === "done") runInfo = e.run || null; else if (e.type === "answer") answerText = e.text; else if (e.type === "error") failed = e.message;
        }
      }
    } catch (e) { failed = e.message; }
    asking = false;
    if (failed && !answerText) { $("#ctxb-intro").textContent = "Context could not finish this investigation: " + failed; return; }
    renderLive(question, answerText, { evidence, findings, lookups, proposed, run: runInfo, fellBack });
    refreshDecisions();
  }

  function renderLive(question, text, m) {
    const a = parseAnswer(text); const body = $("#ctxb-body");
    $("#ctxb-intro").innerHTML = cites(a.structured ? a.Answer || "" : text);
    if (m.fellBack) $("#ctxb-intro").insertAdjacentHTML("beforebegin", `<p class="ctxb-notice">The live model could not complete this investigation (${esc(m.fellBack)}). This answer is scripted sample text, not model reasoning.</p>`);
    a.Evidence.concat(a["Recommended actions"], [a.Pattern]).join(" ").replace(/\[([^\]]+)\]/g, (x, inner) => inner.split(/[,;]\s*/).forEach((r) => CHUNK.test(r.trim()) && m.evidence.add(r.trim())));
    const list = (arr, tag) => arr.length ? `<${tag} class="answer-points">${arr.map((x) => `<li>${cites(x)}</li>`).join("")}</${tag}>` : "";
    const conf = m.findings.length ? Math.round((100 * m.findings.reduce((s, x) => s + x, 0)) / m.findings.length) : null;
    body.innerHTML = `
      ${a.Evidence.length ? `<p class="answer-advisor-label">I found</p>${list(a.Evidence, "ul")}` : ""}
      ${a.Pattern ? `<p class="answer-advisor-label">What we've seen before</p><p class="answer-intro" style="margin-bottom:0;">${cites(a.Pattern)}</p>` : ""}
      ${a["Recommended actions"].length ? `<p class="answer-advisor-label">Recommendation</p>${list(a["Recommended actions"], "ol")}` : ""}
      ${a["Confidence and gaps"] ? `<p class="answer-advisor-label">Confidence and gaps</p><p class="answer-intro" style="margin-bottom:0;">${cites(a["Confidence and gaps"])}</p>` : ""}
      ${conf !== null ? `<div class="answer-confidence"><span class="confidence-badge">Confidence ${conf}%</span></div>` : ""}
      <div class="answer-meta-row"><span><b>${m.lookups}</b> data lookups</span><span><b>${m.evidence.size}</b> evidence paragraphs</span><span>Last updated <b>just now</b></span>${m.run && m.run.verdict ? `<span>Evaluator <b>${m.run.verdict === "pass" ? "passed" : "passed with caveats"}</b> after <b>${m.run.rounds}</b> revision round${m.run.rounds === 1 ? "" : "s"}</span>` : ""}</div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
        ${m.proposed ? `<button class="briefing-decide-btn" type="button" id="ctxb-review">Review ${m.proposed} proposed decision${m.proposed > 1 ? "s" : ""} →</button>` : ""}
        ${m.run && m.run.run_id && !m.run.fallback ? `<button class="answer-close" type="button" id="ctxb-trace">View agent trace</button>` : ""}<button class="answer-close" type="button" id="ctxb-close">Close</button></div>`;
    const rv = $("#ctxb-review"); if (rv) rv.onclick = () => window.switchView("decide");
    const tb = $("#ctxb-trace"); if (tb) tb.onclick = () => showTrace(m.run.run_id);
    $("#ctxb-close").onclick = () => { $("#answer-stage").hidden = true; };
  }

  /* ---------- agent trace ---------- */
  async function showTrace(runId) {
    const body = $("#ctxb-pbody"); panel.classList.add("on"); body.textContent = "Loading…";
    try {
      const t = await api("/api/trace/" + encodeURIComponent(runId));
      const rows = (t.events || []).map((x) => `<div class="para"><div class="tg">${esc(x.role)} · ${esc(x.action)}${x.tool ? " · " + esc(x.tool) : ""}</div>${x.args_summary ? `<div class="mt">${esc(x.args_summary)}</div>` : ""}<div>${esc(x.note || "")}</div><div class="mt">${(x.t / 1000).toFixed(1)}s${x.ms ? " · " + x.ms + " ms" : ""}${x.ok ? "" : " · failed"}</div></div>`).join("");
      body.innerHTML = `<strong>Agent trace</strong><div class="mt">${esc(t.run_id)} · ${Math.round((t.ms || 0) / 1000)}s${t.verdict ? " · " + esc(t.verdict) : ""}</div>${rows}`;
    } catch (e) { body.textContent = e.message; }
  }

  /* ---------- live Actions ---------- */
  const origSwitch = window.switchView;
  window.switchView = function (v) { const r = origSwitch.apply(this, arguments); if (v === "decide") refreshDecisions(); return r; };
  const STATUS = { Approved: ["approved", "✓ Approved"], Rejected: ["rejected", "✕ Rejected"], Deferred: ["deferred", "⏱ Deferred"] };
  async function refreshDecisions() {
    const list = $("#decide-list"); if (!list || !META) return;
    let rows; try { rows = await api("/api/decisions"); } catch { return; }
    let host = $("#ctxb-live-decisions");
    if (!host) { host = document.createElement("div"); host.id = "ctxb-live-decisions"; list.prepend(host); }
    host.replaceChildren();
    host.insertAdjacentHTML("beforeend", `<h3 class="ctxb-sec">Proposed by Context<span class="ctxb-tag">LIVE</span></h3>`);
    if (!rows.length) host.insertAdjacentHTML("beforeend", `<div class="ctxb-empty">No proposals yet. Ask a question under Ask Context and Context will propose actions here, with the evidence behind each one.</div>`);
    for (const d of rows) {
      const card = document.createElement("div"); card.className = "decide-card" + (d.status !== "Pending" ? " is-resolved" : ""); card.dataset.live = d.decision_id;
      const refs = String(d.evidence_refs || "").split(",").map((s) => s.trim()).filter(Boolean);
      const st = STATUS[d.status];
      card.innerHTML = `<h3>${esc(d.title)}</h3><p>${esc(d.rationale || d.outcome || "")}</p>
        ${refs.length ? `<div class="ctxb-refs">${cites("[" + refs.join(", ") + "]")}</div>` : ""}
        <div class="decide-actions">${d.status === "Pending"
          ? `<button class="decide-btn approve" data-s="Approved">Approve</button><button class="decide-btn reject" data-s="Rejected">Reject</button><button class="decide-btn later" data-s="Deferred">Discuss later</button>`
          : `<span class="decide-status-tag ${st ? st[0] : ""}">${st ? st[1] : esc(d.status)}</span>`}</div>`;
      card.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", async () => {
        try { await api("/api/decisions/" + d.decision_id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: b.dataset.s }) }); refreshDecisions(); } catch (e) { alert(e.message); }
      }));
      host.appendChild(card);
    }
    if (!$("#ctxb-sample-head")) host.insertAdjacentHTML("afterend", `<h3 class="ctxb-sec sample" id="ctxb-sample-head">Sample decisions from the original demo</h3>`);
  }

  /* ---------- boot ---------- */
  const pill = document.createElement("div"); pill.className = "ctxb-pill"; pill.id = "ctxb-pill"; document.body.appendChild(pill);
  async function boot() {
    try { META = await api("/api/meta"); } catch { return; }
    pill.className = "ctxb-pill " + META.mode;
    pill.innerHTML = `<i></i>${META.mode === "live" ? "live · " + esc(META.model) + (META.roles ? " · 4 agents" : "") + (META.data === "zetaris" ? " · data via Zetaris" : "") : "sample"}`;
    pill.title = META.mode === "live" ? "Questions are answered by the live agent over your data." : "No language model is connected. Four investigations run as scripted sample answers; other questions use the original demo answers.";
    const wrap = document.querySelector(".ask-suggestions");
    if (wrap && !$("#ctxb-livechips")) {
      const qs = META.supported.length ? META.supported : ["Why is Turkana Water Access at risk of missing its Q3 milestone?", "Why is Garissa Maternal Health burning budget faster than it delivers?", "What should we change before submitting the Nairobi Civic Tech Lab closeout report?", "Which people or contracts create delivery risk in the next two weeks?"];
      const live = document.createElement("div"); live.id = "ctxb-livechips"; live.className = "ctxb-livechips";
      live.innerHTML = `<p class="lbl">Live investigations${META.mode === "sample" ? " (sample)" : ""}</p>`;
      qs.forEach((q) => { const b = document.createElement("button"); b.type = "button"; b.className = "suggestion-chip"; b.textContent = q; b.onclick = () => { const i = $("#ask-input"); if (i) i.value = q; window.handleAsk(q); }; live.appendChild(b); });
      wrap.after(live);
    }
    refreshDecisions();
  }
  window.__ctxb = { cites, parseAnswer, refreshDecisions };
  boot();
})();
