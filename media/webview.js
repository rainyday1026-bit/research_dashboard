// 웹뷰 쪽: 카드 목록(왼쪽) + 상세(오른쪽). 확장 쪽과 postMessage 로만 통신.
const vscode = acquireVsCodeApi();
let DATA = { items: [] }, selected = (vscode.getState() || {}).selected || null, filter = "", viewers = {};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const days = d => { if (!d) return ""; const n = Math.round((Date.now() - new Date(d)) / 86400000); return n <= 0 ? "오늘" : n === 1 ? "어제" : `${n}일 전`; };
let SORT = { mode: "latest", order: [], groups: [], groupOrder: [], collapsed: [] };
let CHAT = { messages: [] }, busy = false, draft = "", chatOpen = (vscode.getState() || {}).chatOpen !== false;
let secClosed = new Set((vscode.getState() || {}).secClosed || []);   // 오른쪽 상세에서 접어 둔 절 이름
const saveState = () => vscode.setState({ selected, chatOpen, secClosed: [...secClosed] });
const saveCollapse = () => vscode.postMessage({ type: "collapse", collapsed: SORT.collapsed });   // 정렬: latest(최신순) / name(이름순) / custom(직접 정렬)
const OLD = "(옛 형식)";
const byLatest = (a, b) => (b.updated || "").localeCompare(a.updated || "") || a.title.localeCompare(b.title, "ko");
const byName = (a, b) => a.title.localeCompare(b.title, "ko");
function sortedCards(items) {
  if (SORT.mode === "name") return [...items].sort(byName);
  if (SORT.mode === "custom") {
    const pos = new Map(SORT.order.map((f, i) => [f, i]));
    const known = items.filter(it => pos.has(it.file)).sort((a, b) => pos.get(a.file) - pos.get(b.file));
    const fresh = items.filter(it => !pos.has(it.file)).sort(byLatest);   // 새 카드는 맨 위
    return [...fresh, ...known];
  }
  return [...items].sort(byLatest);
}
function sortedGroups(groups) {
  const keys = Object.keys(groups);
  const gpos = new Map(SORT.groupOrder.map((g, i) => [g, i]));
  return keys.sort((a, b) => {
    if (a === OLD) return 1; if (b === OLD) return -1;                       // 옛 형식은 항상 맨 아래
    if (SORT.mode === "name") return a.localeCompare(b, "ko");
    if (SORT.mode === "custom") { const pa = gpos.has(a) ? gpos.get(a) : -1, pb = gpos.has(b) ? gpos.get(b) : -1; if (pa !== pb) return pa - pb; }
    const la = groups[a][0], lb = groups[b][0];
    if (!la) return 1; if (!lb) return -1;                                   // 빈 묶음은 뒤
    return byLatest(la, lb);
  });
}
function saveSort() { vscode.postMessage({ type: "sort", mode: SORT.mode, order: SORT.order, groupOrder: SORT.groupOrder }); }
const app = document.getElementById("app");

function render() {
  const items = DATA.items.filter(it => !filter || JSON.stringify(it).toLowerCase().includes(filter.toLowerCase()));
  const groups = {};
  for (const g of SORT.groups) groups[g] = [];                                // 카드 없는 새 묶음
  for (const it of items) (groups[it.project || "(미지정)"] ||= []).push(it);
  const keys = sortedGroups(groups);
  const custom = SORT.mode === "custom";
  const body = keys.map((g, gi) => { const closed = SORT.collapsed.includes(g); return `<div class="group ${closed ? "closed" : ""}" data-project="${esc(g)}"><h3><a class="tg" data-tg="${esc(g)}" title="${closed ? "펴기" : "접기"}">${closed ? "▸" : "▾"}</a><span class="gn">${esc(g)}</span> <span style="opacity:.6">(${groups[g].length})</span>
      <span class="gb">${custom && gi > 0 && keys[gi - 1] !== OLD && g !== OLD ? `<a data-gup="${esc(g)}" title="위로">▲</a>` : ""}${custom && gi < keys.length - 1 && keys[gi + 1] !== OLD && g !== OLD ? `<a data-gdown="${esc(g)}" title="아래로">▼</a>` : ""}
      ${g !== OLD ? `<a data-gren="${esc(g)}" title="이름 바꾸기">✎</a>` : ""}${groups[g].length === 0 ? `<a data-gdel="${esc(g)}" title="빈 묶음 지우기">✕</a>` : ""}</span></h3>
      ${closed ? "" : sortedCards(groups[g]).map(card).join("") || `<div class="drop-hint">여기에 카드를 끌어 놓으세요</div>`}</div>`; }).join("");
  const opt = (v, t) => `<option value="${v}" ${SORT.mode === v ? "selected" : ""}>${t}</option>`;
  const left = `<div class="top"><input id="q" placeholder="검색 (제목·결과·상태)" value="${esc(filter)}">
      <select id="sort" title="정렬">${opt("latest", "최신순")}${opt("name", "이름순")}${opt("custom", "직접 정렬")}</select>
      <button id="ng" title="새 묶음(프로젝트) 만들기">+ 묶음</button><button id="ca" title="묶음 모두 접기">⊟</button><button id="ea" title="묶음 모두 펴기">⊞</button><button id="rf" title="바뀐 STATUS 다시 읽기">↻</button></div>
    <div class="hint">${custom ? "카드를 끌어 순서를 바꾸고, 다른 묶음에 놓으면 그 묶음으로 옮겨집니다(STATUS.md 의 project 줄 변경)." : "카드를 다른 묶음에 끌어 놓으면 그 묶음으로 옮겨집니다(STATUS.md 의 project 줄 변경)."}</div>
    ${body || `<div class="empty">STATUS.md 를 찾지 못함<br><small>${esc((DATA.roots || []).join(", "))}</small></div>`}
    <div style="padding:8px;font-size:10px;opacity:.5">훑은 시각 ${esc(DATA.scannedAt || "")}</div>`;
  const sel = DATA.items.find(it => it.file === selected);
  app.innerHTML = `<div id="left">${left}</div><div id="right"><div id="detail">${sel ? detail(sel) : `<div class="empty">왼쪽에서 작업을 고르세요.</div>`}</div>${chatBox(sel)}</div>`;
  bind();
  const cl = document.getElementById("cl"); if (cl) cl.scrollTop = cl.scrollHeight;
}
// 오른쪽 상세의 절: 제목을 누르면 접힘
const sec = (name, inner, extra = "") => `<h2 class="sec ${secClosed.has(name) ? "closed" : ""}" data-sec="${esc(name)}"><span class="arrow">${secClosed.has(name) ? "▸" : "▾"}</span>${esc(name)}${extra}</h2>${secClosed.has(name) ? "" : inner}`;
// 아주 작은 markdown → html (답변 표시용)
function md(t) {
  let h = esc(t);
  h = h.replace(/```[\w-]*\n([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`);
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/^#{1,3} (.*)$/gm, "<b>$1</b>");
  h = h.replace(/^(?:- |\* )(.*)$/gm, "<li>$1</li>");
  h = h.replace(/(?:<li>.*<\/li>\n?)+/g, m => `<ul>${m.replace(/\n/g, "")}</ul>`);
  return h.replace(/\n/g, "<br>");
}
function chatBox(sel) {
  const msgs = (CHAT.messages || []).map(m => `<div class="msg ${m.role}"><div class="who">${m.role === "user" ? "나" : "claude"} <span class="at">${esc((m.at || "").slice(5, 16).replace("T", " "))}${esc(m.usage || "")}</span></div><div class="body">${m.role === "user" ? esc(m.text) : md(m.text)}</div></div>`).join("");
  return `<div id="chat" class="${chatOpen ? "" : "closed"}">
    <div class="ch"><a id="ct" title="${chatOpen ? "접기" : "펴기"}">${chatOpen ? "▾" : "▸"}</a> <b>질문 칸</b> <span class="at">claude -p · 읽기만 · ${sel ? "고른 작업: " + esc(sel.title) : "작업을 고르면 그 STATUS 를 같이 보냄"}${CHAT.sessionId ? " · 대화 이어짐" : ""}</span>
      <span class="gb"><button id="qb1" title="고른 작업의 STATUS·history 로 브리핑">이 작업 브리핑</button><button id="qb2" title="모든 STATUS.md 로 브리핑">전체 브리핑</button><button id="cc" title="세션을 끊고 새로 시작">새 대화</button></span></div>
    ${chatOpen ? `<div id="cl">${msgs || `<div class="empty" style="padding:10px">예: "지금 어디까지 됐어?", "남은 일 뭐야?", "주요 결과 세 줄로"</div>`}${busy ? `<div class="msg assistant"><div class="who">claude</div><div class="body"><i>답하는 중…</i> <a id="cx" style="cursor:pointer">중지</a></div></div>` : ""}</div>
    <div class="ci"><textarea id="qa" rows="2" placeholder="질문 (Enter 보내기, Shift+Enter 줄바꿈)" ${busy ? "disabled" : ""}>${esc(draft)}</textarea><button id="qs" class="primary" ${busy ? "disabled" : ""}>보내기</button></div>` : ""}</div>`;
}
function card(it) {
  const p = it.progress || { done: 0, total: 0 }, pct = p.total ? Math.round(100 * p.done / p.total) : 0;
  return `<div class="card ${it.file === selected ? "sel" : ""}" data-file="${esc(it.file)}" data-project="${esc(it.project)}" draggable="true">
    <div class="t"><span class="grip">⋮⋮</span>${esc(it.title)}</div>
    <div class="m"><span class="badge ${esc(it.status)}">${esc(it.status)}</span><span>갱신 ${esc(it.updated)} (${days(it.updated)})</span><span>${p.done}/${p.total} 단계</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="now">${esc(it.now)}</div></div>`;
}
function detail(it) {
  const p = it.progress || { done: 0, total: 0 };
  const results = (it.results || []).map((r, i) => `<div class="res"><span class="d">${esc(r.date)}</span><span>${esc(r.text)}<br>
      ${r.paths.map(pp => `<a data-ref="${esc(pp)}" data-i="${i}" title="${esc(pp)}">▸ ${esc(pp.split("/").pop())}</a>`).join("")}
      ${r.paths.length ? `<a data-open="${esc(r.paths[0])}" style="opacity:.7">(열기)</a>` : ""}</span></div>
      <div class="viewer" id="v${i}" style="display:${viewers[it.file + i] ? "block" : "none"}">${viewers[it.file + i] || ""}</div>`).join("");
  return `<h1>${esc(it.title)}</h1>
    <div class="sub"><span class="badge ${esc(it.status)}">${esc(it.status)}</span> &nbsp; 프로젝트 <b>${esc(it.project)}</b> · 시작 ${esc(it.started)} · 갱신 ${esc(it.updated)} (${days(it.updated)}) · <code>${esc(it.folder)}</code></div>
    <div class="actions"><button id="bStatus">STATUS.md 열기</button><button id="bFolder">폴더 보기</button><button id="bClaude" class="primary">이 폴더에서 claude 열기</button></div>
    ${it.error ? `<p class="warn">파싱 오류: ${esc(it.error)}</p>` : ""}
    ${sec("현재 상태", `<div class="now-box">${esc(it.now)}</div>`)}
    ${sec("목표", `<p class="block">${esc(it.goal)}</p>`)}
    ${sec("이유", `<p class="block">${esc(it.why)}</p>`)}
    ${sec("진행 단계", `<ul>${(it.steps || []).map(s => `<li class="step ${s.done ? "done" : ""}">${s.done ? "☑" : "☐"} ${esc(s.text)}</li>`).join("")}</ul>`, ` (${p.done}/${p.total})`)}
    ${sec("주요 결과", results || "<p class='block' style='opacity:.6'>없음</p>")}
    ${sec("재개", `<div>읽을 것: ${(it.resume?.read || []).map(r => `<a class="rd" data-open="${esc(r.replace(/\s*\(.*\)$/, ""))}" style="cursor:pointer;color:var(--vscode-textLink-foreground)">${esc(r)}</a>`).join(" · ") || "-"}</div>
    <div style="margin-top:4px">돌고 있는 것: ${esc(it.resume?.running || "-")}</div>
    ${(it.resume?.commands || []).map((c, i) => `<div class="cmd"><code>${esc(c.cmd)}</code><span class="note">${esc(c.note)}</span><button class="term" data-cmd="${esc(c.cmd)}">터미널에 넣기</button></div>`).join("")}`)}
    ${sec("기록", `<ul>${(it.records || []).map(r => `<li>${esc(r)}</li>`).join("")}</ul>`)}`;
}
function bind() {
  const q = document.getElementById("q"); q.oninput = e => { filter = e.target.value; render(); document.getElementById("q").focus(); };
  document.getElementById("rf").onclick = () => vscode.postMessage({ type: "refresh" });
  document.getElementById("sort").onchange = e => {
    SORT.mode = e.target.value;
    if (SORT.mode === "custom" && !SORT.order.length) SORT.order = [...DATA.items].sort(byLatest).map(it => it.file);  // 처음엔 최신순으로 시작
    if (SORT.mode === "custom" && !SORT.groupOrder.length) SORT.groupOrder = [...document.querySelectorAll(".group")].map(g => g.dataset.project).filter(g => g !== OLD);
    saveSort(); render();
  };
  document.getElementById("ng").onclick = () => vscode.postMessage({ type: "newGroup" });
  document.querySelectorAll(".card").forEach(c => c.onclick = () => { selected = c.dataset.file; saveState(); render(); });   // 카드 고르기
  document.getElementById("ca").onclick = () => { SORT.collapsed = [...document.querySelectorAll(".group")].map(g => g.dataset.project); saveCollapse(); render(); };
  document.getElementById("ea").onclick = () => { SORT.collapsed = []; saveCollapse(); render(); };
  document.querySelectorAll("a[data-tg]").forEach(a => a.onclick = e => { e.stopPropagation(); const g = a.dataset.tg;
    SORT.collapsed = SORT.collapsed.includes(g) ? SORT.collapsed.filter(x => x !== g) : [...SORT.collapsed, g]; saveCollapse(); render(); });
  document.querySelectorAll("h2.sec").forEach(h => h.onclick = () => { const n = h.dataset.sec; secClosed.has(n) ? secClosed.delete(n) : secClosed.add(n); saveState(); render(); });
  // 질문 칸
  const send = (q, scope) => { q = (q || "").trim(); if (!q || busy) return; draft = ""; vscode.postMessage({ type: "ask", q, file: selected, scope }); };
  const q2 = id => document.getElementById(id);
  if (q2("ct")) q2("ct").onclick = () => { chatOpen = !chatOpen; saveState(); render(); };
  if (q2("cc")) q2("cc").onclick = () => vscode.postMessage({ type: "chatClear" });
  if (q2("cx")) q2("cx").onclick = () => vscode.postMessage({ type: "chatCancel" });
  if (q2("qb1")) q2("qb1").onclick = () => send("이 작업이 지금 어디까지 됐고, 주요 결과와 남은 일이 무엇인지 다섯 줄 안으로 브리핑해 줘.", "card");
  if (q2("qb2")) q2("qb2").onclick = () => send("모든 작업을 하나씩 한두 줄로: 현재 상태, 마지막 갱신, 다음에 할 일.", "all");
  if (q2("qa")) { q2("qa").oninput = e => draft = e.target.value;
    q2("qa").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q2("qa").value, "card"); } }; }
  if (q2("qs")) q2("qs").onclick = () => send(q2("qa").value, "card");
  document.querySelectorAll("a[data-gren]").forEach(a => a.onclick = () => vscode.postMessage({ type: "renameGroup", from: a.dataset.gren }));
  document.querySelectorAll("a[data-gdel]").forEach(a => a.onclick = () => vscode.postMessage({ type: "deleteGroup", name: a.dataset.gdel }));
  const moveGroup = (g, dir) => {
    const cur = [...document.querySelectorAll(".group")].map(x => x.dataset.project).filter(x => x !== OLD);
    const i = cur.indexOf(g), j = i + dir; if (i < 0 || j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]]; SORT.groupOrder = cur; saveSort(); render();
  };
  document.querySelectorAll("a[data-gup]").forEach(a => a.onclick = () => moveGroup(a.dataset.gup, -1));
  document.querySelectorAll("a[data-gdown]").forEach(a => a.onclick = () => moveGroup(a.dataset.gdown, 1));
  // 끌어서 놓기: 같은 묶음 안 = 순서(직접 정렬일 때만 저장), 다른 묶음 = project 변경
  let dragging = null;
  document.querySelectorAll(".card[draggable]").forEach(c => {
    c.ondragstart = e => { dragging = c; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; };
    c.ondragend = () => { c.classList.remove("dragging"); dragging = null; document.querySelectorAll(".group.over").forEach(g => g.classList.remove("over")); };
    c.ondragover = e => { e.preventDefault(); if (!dragging || dragging === c) return;
      if (SORT.mode !== "custom" && c.dataset.project === dragging.dataset.project) return;   // 최신순·이름순에서는 같은 묶음 안 순서 바꾸기 없음
      const r = c.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
      c.parentNode.insertBefore(dragging, after ? c.nextSibling : c); };
  });
  document.querySelectorAll(".group").forEach(g => {
    g.ondragover = e => { e.preventDefault(); if (dragging) g.classList.add("over"); if (dragging && !g.contains(dragging) && !g.querySelector(".card")) g.appendChild(dragging); };
    g.ondragleave = () => g.classList.remove("over");
    g.ondrop = e => { e.preventDefault(); e.stopPropagation(); if (!dragging) return;
      const target = g.dataset.project, from = dragging.dataset.project, file = dragging.dataset.file;
      SORT.order = [...document.querySelectorAll(".card[draggable]")].map(x => x.dataset.file);
      if (target !== from) { saveSort(); vscode.postMessage({ type: "setProject", file, project: target }); }   // 옛 형식으로 되돌리기도 허용(project 가 "(옛 형식)" 으로 적힘)
      else if (SORT.mode === "custom") { saveSort(); render(); }
      else render(); };
  });
  const f = selected;
  const g = id => document.getElementById(id);
  if (g("bStatus")) g("bStatus").onclick = () => vscode.postMessage({ type: "openStatus", file: f });
  if (g("bFolder")) g("bFolder").onclick = () => vscode.postMessage({ type: "revealFolder", file: f });
  if (g("bClaude")) g("bClaude").onclick = () => vscode.postMessage({ type: "claude", file: f });
  document.querySelectorAll("a[data-ref]").forEach(a => a.onclick = () => {
    const key = f + a.dataset.i;
    if (viewers[key] && viewers[key + "_ref"] === a.dataset.ref) { delete viewers[key]; render(); return; }   // 다시 누르면 닫기
    viewers[key + "_ref"] = a.dataset.ref; viewers[key] = "<i>읽는 중…</i>"; render();
    vscode.postMessage({ type: "result", file: f, ref: a.dataset.ref, i: a.dataset.i });
  });
  document.querySelectorAll("a[data-open]").forEach(a => a.onclick = () => vscode.postMessage({ type: "openFile", file: f, ref: a.dataset.open }));
  document.querySelectorAll("button.term").forEach(b => b.onclick = () => vscode.postMessage({ type: "terminal", file: f, cmd: b.dataset.cmd }));
}
function viewerHtml(d, ref) {
  const head = (extra = "") => `<div class="vh"><span>${esc(d.path)}</span><span>${extra} <a data-open="${esc(ref)}" style="cursor:pointer;color:var(--vscode-textLink-foreground)">편집기로 열기</a></span></div>`;
  if (d.kind === "missing") return `<span class="warn">파일 없음: ${esc(d.path)}</span>`;
  if (d.kind === "image") return head() + `<img src="${d.uri}">`;
  if (d.kind === "csv") return head(`${d.total}행 중 ${d.rows.length}행`) + `<div class="tw"><table><tr>${d.header.map(h => `<th>${esc(h)}</th>`).join("")}</tr>${d.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div>`;
  if (d.kind === "text") return head(d.anchor ? `절 #${esc(d.anchor)}` : "") + `<pre>${esc(d.text)}</pre>`;
  if (d.kind === "dir") return head(`${d.total}개`) + `<pre>${esc(d.list.join("\n"))}</pre>`;
  if (d.kind === "opened") return `<span style="opacity:.7">VS Code 로 열었음: ${esc(d.path)}</span>`;
  return "";
}
window.addEventListener("message", ev => {
  const m = ev.data;
  if (m.type === "data") { DATA = m; if (m.sort) SORT = { mode: m.sort.mode || "latest", order: m.sort.order || [], groups: m.sort.groups || [], groupOrder: m.sort.groupOrder || [], collapsed: m.sort.collapsed || [] }; if (!DATA.items.find(it => it.file === selected)) selected = DATA.items[0]?.file || null; render(); }
  if (m.type === "chat") { CHAT = m.chat || { messages: [] }; busy = !!m.busy; render(); }
  if (m.type === "chatError") { busy = false; CHAT.messages.push({ role: "assistant", text: "오류: " + m.text, at: new Date().toISOString() }); render(); }
  if (m.type === "result") { viewers[m.file + m.i] = viewerHtml(m.data, m.ref); render(); }
});
vscode.postMessage({ type: "ready" }); vscode.postMessage({ type: "chatGet" });
