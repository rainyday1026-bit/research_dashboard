// Research Dashboard — STATUS.md(research-log 형식) 를 읽어 작업 카드를 보여 주는 VS Code 확장.
// 형식: ~/.claude/skills/research-log/FORMAT.md
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

let panel = null, cache = { entries: {} }, pollTimer = null, statusItem = null, storageDir = null;
const cfg = () => vscode.workspace.getConfiguration("researchDashboard");
// 설정이 비어 있으면: roots = 열린 작업 폴더(없으면 홈), cacheFile = VS Code 가 확장에 주는 저장 폴더
function rootsList() {
  const r = cfg().get("roots") || [];
  if (r.length) return r;
  const ws = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
  return ws.length ? ws : [require("os").homedir()];
}
function cacheFilePath() { return cfg().get("cacheFile") || path.join(storageDir || require("os").homedir(), "cache.json"); }

// ---------- 훑기 · 캐시 ----------
function findStatusFiles() {
  const roots = rootsList(), maxDepth = cfg().get("maxDepth"), skip = new Set(cfg().get("skipDirs"));
  const found = [];
  const walk = (dir, depth) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (ents.length > 3000) return;                               // 자료 폴더(파일 수천 개)는 건너뜀
    for (const e of ents) {
      if (e.isFile() && e.name === "STATUS.md") found.push(path.join(dir, e.name));
    }
    if (depth >= maxDepth) return;
    for (const e of ents) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      if (e.name.startsWith(".") || skip.has(e.name)) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  for (const r of roots) walk(r, 0);
  return found;
}
function loadCache() { try { cache = JSON.parse(fs.readFileSync(cacheFilePath(), "utf8")); if (!cache.entries) cache = { entries: {} }; } catch { cache = { entries: {} }; } }
function saveCache() { try { const f = cacheFilePath(); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(cache, null, 1)); } catch (e) { console.error(e); } }

// 바뀐 것만 다시 파싱. full=true 면 폴더를 다시 훑어 새 STATUS/없어진 STATUS 반영.
function refresh(full) {
  let files = full ? findStatusFiles() : Object.keys(cache.entries);
  if (full) for (const k of Object.keys(cache.entries)) if (!files.includes(k)) delete cache.entries[k];
  let changed = 0;
  for (const f of files) {
    let st; try { st = fs.statSync(f); } catch { delete cache.entries[f]; changed++; continue; }
    const old = cache.entries[f];
    if (old && old.mtimeMs === st.mtimeMs) continue;
    try { cache.entries[f] = { mtimeMs: st.mtimeMs, data: parseStatus(f, fs.readFileSync(f, "utf8")) }; changed++; }
    catch (e) { cache.entries[f] = { mtimeMs: st.mtimeMs, data: { file: f, folder: path.dirname(f), title: path.basename(path.dirname(f)), project: "(파싱 오류)", error: String(e) } }; changed++; }
  }
  cache.scannedAt = new Date().toISOString();
  if (changed || full) saveCache();
  return changed;
}

// ---------- STATUS.md 파싱 ----------
function parseStatus(file, text) {
  const d = { file, folder: path.dirname(file), title: path.basename(path.dirname(file)), project: "(미지정)", status: "active", started: "", updated: "",
              goal: "", why: "", now: "", results: [], steps: [], resume: { read: [], running: "", commands: [] }, records: [] };
  let body = text;
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (fm) { body = text.slice(fm[0].length); for (const l of fm[1].split("\n")) { const m = l.match(/^(\w+)\s*:\s*(.*)$/); if (m) d[m[1]] = m[2].trim(); } }
  if (fm && String(d.legacy) === "true") {                      // 옛 형식에 대시보드가 머리말만 붙인 경우: 본문은 옛 규칙으로 읽음
    d.legacy = true;
    const ap = body.match(/Active phase\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/m); if (ap) d.now = ap[1].replace(/\*/g, "").trim();
    if (!d.updated) { const lu = body.match(/Last updated\*{0,2}\s*:\s*\*{0,2}\s*([\d-]+)/); if (lu) d.updated = lu[1]; }
  }
  else if (!fm) {                                                        // 옛 형식(머리말 없음): 제목·갱신일·단계만 뽑고 "(옛 형식)" 으로 묶음
    const h = text.match(/^#\s+(?:STATUS\s*[—-]\s*)?(.*)$/m); if (h) d.title = h[1].trim();
    const lu = text.match(/Last updated\*{0,2}\s*:\s*\*{0,2}\s*([\d-]+)/); if (lu) d.updated = lu[1];
    const ap = text.match(/Active phase\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/m); if (ap) d.now = ap[1].replace(/\*/g, "").trim();
    d.project = "(옛 형식)"; d.status = "paused"; d.legacy = true;
  }
  const sec = {}; let cur = null;
  for (const l of body.split("\n")) { const h = l.match(/^##\s+(.*)/); if (h) { cur = h[1].trim(); sec[cur] = []; } else if (cur) sec[cur].push(l); }
  const txt = k => (sec[k] || []).join("\n").trim();
  d.goal = txt("목표"); d.why = txt("이유"); if (sec["현재 상태"]) d.now = txt("현재 상태");
  for (const l of sec["주요 결과"] || []) {
    const m = l.match(/^-\s+(.*)$/); if (!m) continue;
    const parts = m[1].split(" | ");
    if (parts.length >= 2) d.results.push({ date: parts[0].trim(), text: parts[1].trim(), paths: (parts[2] || "").split(";").map(s => s.trim()).filter(Boolean) });
    else d.results.push({ date: "", text: m[1].trim(), paths: [] });
  }
  for (const l of sec["진행 단계"] || []) { const m = l.match(/^-\s+\[( |x|X)\]\s+(.*)$/); if (m) d.steps.push({ done: m[1] !== " ", text: m[2].trim() }); }
  for (const l of sec["재개"] || []) {
    let m;
    if ((m = l.match(/^-\s+읽을 것\s*:\s*(.*)$/))) d.resume.read = m[1].split(/,\s*(?![^()]*\))/).map(s => s.trim()).filter(Boolean);
    else if ((m = l.match(/^-\s+돌고 있는 것\s*:\s*(.*)$/))) d.resume.running = m[1].trim();
    else if ((m = l.match(/^-\s+명령\s*:\s*`([^`]+)`\s*(.*)$/))) d.resume.commands.push({ cmd: m[1].trim(), note: m[2].trim() });
  }
  for (const l of sec["기록"] || []) { const m = l.match(/^-\s+(.*)$/); if (m) d.records.push(m[1].trim()); }
  d.progress = { done: d.steps.filter(s => s.done).length, total: d.steps.length };
  return d;
}

// ---------- 결과 파일 열기 (그림 · CSV · MD/TXT) ----------
function resolveRef(folder, ref) {
  const [p, anchor] = ref.split("#");
  const abs = path.resolve(folder, p.trim());
  return { abs, anchor: anchor ? anchor.trim() : "" };
}
function mdSection(text, anchor) {           // "#2" → "## 2." 로 시작하는 절, "#5c" → "## 5c." ; 없으면 전체
  if (!anchor) return text;
  const lines = text.split("\n"); let out = [], on = false, lvl = 0;
  for (const l of lines) {
    const h = l.match(/^(#+)\s+(.*)/);
    if (h) {
      const headNum = h[2].trim().split(/[\s.]/)[0];
      if (!on && headNum.toLowerCase() === anchor.toLowerCase()) { on = true; lvl = h[1].length; out.push(l); continue; }
      if (on && h[1].length <= lvl) break;
    }
    if (on) out.push(l);
  }
  return out.length ? out.join("\n") : text;
}
function csvTable(text, maxRows = 50) {
  const lines = text.split(/\r?\n/).filter(l => l.length); const n = lines.length;
  const rows = lines.slice(0, maxRows + 1).map(l => l.split(","));
  return { header: rows[0] || [], rows: rows.slice(1), total: Math.max(n - 1, 0) };
}
async function openResult(folder, ref) {
  const { abs, anchor } = resolveRef(folder, ref);
  if (!fs.existsSync(abs)) return { kind: "missing", path: abs };
  const st = fs.statSync(abs); const ext = path.extname(abs).toLowerCase();
  if (st.isDirectory()) {
    const list = fs.readdirSync(abs).slice(0, 200);
    return { kind: "dir", path: abs, list, total: fs.readdirSync(abs).length };
  }
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"].includes(ext)) return { kind: "image", path: abs, uri: panel.webview.asWebviewUri(vscode.Uri.file(abs)).toString() };
  if (ext === ".csv") return { kind: "csv", path: abs, ...csvTable(fs.readFileSync(abs, "utf8")) };
  if ([".md", ".txt", ".log", ".json", ".yaml", ".yml", ".py", ".sh"].includes(ext)) {
    let t = fs.readFileSync(abs, "utf8"); if (ext === ".md") t = mdSection(t, anchor);
    if (t.length > 20000) t = t.slice(0, 20000) + "\n… (잘림, 파일 열기로 전체 보기)";
    return { kind: "text", path: abs, text: t, anchor };
  }
  vscode.commands.executeCommand("vscode.open", vscode.Uri.file(abs));
  return { kind: "opened", path: abs };
}

// ---------- 웹뷰 ----------
function orderFile() { return path.join(path.dirname(cacheFilePath()), "order.json"); }   // 정렬 방식 + 직접 정렬 순서
function loadOrder() { let o = {}; try { o = JSON.parse(fs.readFileSync(orderFile(), "utf8")); } catch {} return { mode: o.mode || "latest", order: o.order || [], groups: o.groups || [], groupOrder: o.groupOrder || [], collapsed: o.collapsed || [] }; }
// 카드의 묶음(project) 바꾸기: STATUS.md 머리말의 project 줄만 교체. 머리말이 없는 옛 형식은 머리말을 앞에 끼워 넣음(본문 그대로).
function setProject(file, project) {
  const text = fs.readFileSync(file, "utf8");
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  let out;
  if (fm) {
    const lines = fm[1].split("\n"); let hit = false;
    for (let i = 0; i < lines.length; i++) if (/^project\s*:/.test(lines[i])) { lines[i] = `project: ${project}`; hit = true; }
    if (!hit) lines.push(`project: ${project}`);
    out = `---\n${lines.join("\n")}\n---\n` + text.slice(fm[0].length);
  } else {
    const d = parseStatus(file, text);
    out = `---\ntitle: ${d.title}\nproject: ${project}\nupdated: ${d.updated || ""}\nlegacy: true\n---\n` + text;
  }
  fs.writeFileSync(file, out);
}
function saveOrder(o) { try { fs.writeFileSync(orderFile(), JSON.stringify(o, null, 1)); } catch (e) { console.error(e); } }
// ---- 질문 칸: claude -p (구독 로그인 그대로) 로 브리핑. 읽기 도구만 허용, 파일 수정 없음 ----
let chat = { sessionId: null, lastCard: null, messages: [] }, child = null;
function chatFile() { return path.join(path.dirname(cacheFilePath()), "chat.json"); }
function loadChat() { try { chat = JSON.parse(fs.readFileSync(chatFile(), "utf8")); if (!chat.messages) chat.messages = []; } catch { chat = { sessionId: null, lastCard: null, messages: [] }; } }
function saveChat() { try { fs.writeFileSync(chatFile(), JSON.stringify(chat, null, 1)); } catch (e) { console.error(e); } }
function claudeBin() { const c = cfg().get("claudePath"); if (c) return c; for (const p of [path.join(process.env.HOME || "", ".local/bin/claude"), "/usr/local/bin/claude"]) if (fs.existsSync(p)) return p; return "claude"; }
function cardBrief(d) { return `- ${d.title} | 묶음 ${d.project} | ${d.status} | 갱신 ${d.updated} | 폴더 ${d.folder}\n  현재: ${(d.now || "").split("\n")[0]}`; }
function buildPrompt(q, file, scope) {
  const items = cardsPayload().items; const sel = items.find(it => it.file === file);
  const parts = [];
  const fresh = !chat.sessionId;
  if (fresh) parts.push(`[연구 대시보드 작업 목록]\n${items.map(cardBrief).join("\n")}`);
  if (scope === "all") parts.push(`[모든 작업의 STATUS.md]\n` + items.filter(it => !it.legacy).map(it => `### ${it.file}\n${fs.readFileSync(it.file, "utf8")}`).join("\n\n"));
  else if (sel && (fresh || chat.lastCard !== file)) {
    let ctx = `[지금 고른 작업: ${sel.title}]\n폴더: ${sel.folder}\n--- STATUS.md ---\n${fs.readFileSync(sel.file, "utf8")}`;
    try {                                                                 // 가장 최근 history 파일 끝부분도 같이
      const hd = fs.existsSync(path.join(sel.folder, "history")) ? path.join(sel.folder, "history") : sel.folder;
      const hs = fs.readdirSync(hd).filter(f => /^history.*\.md$/.test(f)).sort();
      if (hs.length) { const t = fs.readFileSync(path.join(hd, hs[hs.length - 1]), "utf8"); ctx += `\n--- ${hs[hs.length - 1]} (끝 6000자) ---\n${t.slice(-6000)}`; }
    } catch {}
    parts.push(ctx);
  }
  if (sel) chat.lastCard = file;
  parts.push(`[질문]\n${q}`);
  return parts.join("\n\n");
}
const systemPrompt = () => "You are the briefing assistant of a research dashboard. Answer the user's question in the language they use, conclusion first, briefly. "
  + "State numbers only as written in STATUS.md or history files; if you infer something, say it is an inference. "
  + `You may read files under ${rootsList().join(", ")} with Read/Glob/Grep, but never create or modify files. `
  + "For long or multi-step tasks, suggest running them in Claude Code in the terminal instead.";
function ask(q, file, scope) {
  if (child) { vscode.window.showWarningMessage("앞 질문에 답하는 중입니다."); return; }
  let prompt; try { prompt = buildPrompt(q, file, scope); } catch (e) { post({ type: "chatError", text: String(e) }); return; }
  chat.messages.push({ role: "user", text: q, at: new Date().toISOString() }); saveChat();
  post({ type: "chat", chat, busy: true });
  const args = ["-p", prompt, "--output-format", "json", "--allowedTools", "Read", "Glob", "Grep", "--append-system-prompt", systemPrompt()];
  if (chat.sessionId) args.push("--resume", chat.sessionId);
  const model = cfg().get("claudeModel"); if (model) args.push("--model", model);
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  let out = "", err = "";
  try { child = spawn(claudeBin(), args, { cwd: rootsList()[0], env }); }
  catch (e) { child = null; post({ type: "chatError", text: `claude 실행 실패: ${e}` }); return; }
  const timer = setTimeout(() => { try { child.kill("SIGTERM"); } catch {} }, 1000 * Math.max(30, cfg().get("claudeTimeoutSeconds") || 300));
  child.stdout.on("data", d => out += d); child.stderr.on("data", d => err += d);
  child.on("close", code => {
    clearTimeout(timer); child = null;
    let text = "", j = null;
    try { j = JSON.parse(out); } catch {}
    if (j && j.result !== undefined) { text = String(j.result); if (j.session_id) chat.sessionId = j.session_id; }
    else if (j && j.is_error) text = `오류: ${j.result || out}`;
    else text = code === 0 ? (out.trim() || "(빈 답)") : `claude 종료 코드 ${code}\n${err.trim() || out.trim()}`;
    const usage = j && j.usage ? ` (입력 ${(j.usage.input_tokens || 0) + (j.usage.cache_read_input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0)} / 출력 ${j.usage.output_tokens || 0} 토큰)` : "";
    chat.messages.push({ role: "assistant", text, at: new Date().toISOString(), usage }); saveChat();
    post({ type: "chat", chat, busy: false });
  });
}
// ---- claude 대화 목록: ~/.claude/projects/<cwd 를 - 로 바꾼 이름>/<세션>.jsonl. 카드 폴더와 그 상위 폴더에서 연 대화를 모두 보여 줌 ----
function sessionDirFor(cwd) { return path.join(process.env.HOME || "", ".claude", "projects", cwd.replace(/[\/_]/g, "-")); }
function firstPrompt(file) {                                     // 파일 앞부분만 읽어 첫 사용자 입력 한 줄
  let fd, buf = Buffer.alloc(256 * 1024), n = 0;
  try { fd = fs.openSync(file, "r"); n = fs.readSync(fd, buf, 0, buf.length, 0); } catch { return ""; } finally { if (fd !== undefined) fs.closeSync(fd); }
  for (const l of buf.toString("utf8", 0, n).split("\n")) {
    if (!l.includes('"type":"user"')) continue;
    try { const d = JSON.parse(l); const c = d.message && d.message.content;
      const txt = typeof c === "string" ? c : Array.isArray(c) ? c.filter(x => x.type === "text").map(x => x.text).join(" ") : "";
      const t = txt.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (t && !t.startsWith("<")) return t.slice(0, 80);
    } catch {}
  }
  return "";
}
function listSessions(folder) {
  const roots = rootsList(); const out = [];
  let cur = folder;
  for (let depth = 0; depth < 6 && cur && cur.length >= Math.min(...roots.map(r => r.length)) - 1; depth++) {   // 카드 폴더 → 상위 폴더(root 까지)
    const dir = sessionDirFor(cur);
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".jsonl")) continue;
        const st = fs.statSync(path.join(dir, f)); if (st.size < 2000) continue;        // 빈 세션 제외
        const fp = firstPrompt(path.join(dir, f));
        if (fp.startsWith("[연구 대시보드")) continue;                                   // 대시보드 질문 칸이 만든 세션은 제외
        out.push({ id: f.slice(0, -6), cwd: cur, mtime: st.mtimeMs, size: st.size, depth, file: path.join(dir, f), prompt: fp });
      }
    } catch {}
    if (roots.includes(cur)) break;
    const up = path.dirname(cur); if (up === cur) break; cur = up;
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, 30);
}
async function pickClaudeSession(folder) {
  const ses = listSessions(folder);
  const fmt = ms => new Date(ms).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const items = [
    { label: "$(add) 새 대화", description: folder, cmd: "claude", cwd: folder },
    ...(ses.length ? [{ label: "$(history) 가장 최근 대화 이어가기", description: `${fmt(ses[0].mtime)} · ${ses[0].cwd}`, cmd: `claude --resume ${ses[0].id}`, cwd: ses[0].cwd }] : []),
    ...(ses.length ? [{ label: "이전 대화 고르기", kind: vscode.QuickPickItemKind.Separator }] : []),
    ...ses.map(s => ({ label: `$(comment-discussion) ${fmt(s.mtime)}  ${s.prompt || "(첫 입력 없음)"}`, description: `${s.depth ? "상위 폴더 " : ""}${path.basename(s.cwd)} · ${(s.size / 1e6).toFixed(1)} MB`, cmd: `claude --resume ${s.id}`, cwd: s.cwd }))
  ];
  return vscode.window.showQuickPick(items, { placeHolder: ses.length ? `이 폴더(와 상위 폴더)의 claude 대화 ${ses.length}개` : "이 폴더에서 연 claude 대화가 없음", matchOnDescription: true });
}
function cardsPayload() {
  const items = Object.values(cache.entries).map(e => e.data);
  items.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  return { items, scannedAt: cache.scannedAt, roots: rootsList(), sort: loadOrder() };
}
function post(msg) { if (panel) panel.webview.postMessage(msg); }

function openPanel(context) {
  if (panel) { panel.reveal(); post({ type: "data", ...cardsPayload() }); return; }
  const roots = rootsList().map(r => vscode.Uri.file(r));
  panel = vscode.window.createWebviewPanel("researchDashboard", "Research Dashboard", vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media")), ...roots] });
  const media = f => panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", f)));
  const nonce = String(Date.now());
  panel.webview.html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${media("style.css")}"><title>Research Dashboard</title></head>
<body><div id="app"></div><script nonce="${nonce}" src="${media("webview.js")}"></script></body></html>`;
  panel.onDidDispose(() => { panel = null; });
  panel.webview.onDidReceiveMessage(async m => {
    const e = cache.entries[m.file]; const folder = e ? e.data.folder : null;
    switch (m.type) {
      case "ready": post({ type: "data", ...cardsPayload() }); break;
      case "refresh": refresh(true); post({ type: "data", ...cardsPayload() }); break;
      case "sort": saveOrder({ ...loadOrder(), mode: m.mode, order: m.order || [], groupOrder: m.groupOrder || loadOrder().groupOrder }); break;
      case "collapse": saveOrder({ ...loadOrder(), collapsed: m.collapsed || [] }); break;
      case "ask": ask(m.q, m.file, m.scope); break;
      case "chatCancel": if (child) { try { child.kill("SIGTERM"); } catch {} } break;
      case "chatClear": chat = { sessionId: null, lastCard: null, messages: [] }; saveChat(); post({ type: "chat", chat, busy: false }); break;
      case "chatGet": post({ type: "chat", chat, busy: !!child }); break;
      case "setProject": {                                       // 카드를 다른 묶음에 놓음
        try { setProject(m.file, m.project); } catch (e) { vscode.window.showErrorMessage(`project 변경 실패: ${e}`); }
        const o = loadOrder(); o.groups = o.groups.filter(g => g !== m.project); saveOrder(o);   // 빈 묶음 목록에서는 뺌(이제 카드가 있음)
        refresh(false); post({ type: "data", ...cardsPayload() }); break;
      }
      case "newGroup": {
        const name = (await vscode.window.showInputBox({ prompt: "새 묶음(프로젝트) 이름", placeHolder: "예: 박달 timelapse" }) || "").trim();
        if (!name) break;
        const o = loadOrder(); if (!o.groups.includes(name)) o.groups.push(name); if (!o.groupOrder.includes(name)) o.groupOrder.unshift(name); saveOrder(o);
        post({ type: "data", ...cardsPayload() }); break;
      }
      case "renameGroup": {                                      // 그 묶음의 카드 전부 project 교체
        const name = (await vscode.window.showInputBox({ prompt: `묶음 이름 바꾸기: ${m.from}`, value: m.from }) || "").trim();
        if (!name || name === m.from) break;
        for (const e of Object.values(cache.entries)) if (e.data.project === m.from) { try { setProject(e.data.file, name); } catch (err) { vscode.window.showErrorMessage(`project 변경 실패: ${err}`); } }
        const o = loadOrder(); o.groups = o.groups.map(g => g === m.from ? name : g); o.groupOrder = o.groupOrder.map(g => g === m.from ? name : g); saveOrder(o);
        refresh(false); post({ type: "data", ...cardsPayload() }); break;
      }
      case "deleteGroup": {                                      // 카드 없는 빈 묶음만 지움
        const o = loadOrder(); o.groups = o.groups.filter(g => g !== m.name); o.groupOrder = o.groupOrder.filter(g => g !== m.name); saveOrder(o);
        post({ type: "data", ...cardsPayload() }); break;
      }
      case "openFile": { const { abs } = resolveRef(folder || "/", m.ref); vscode.commands.executeCommand("vscode.open", vscode.Uri.file(abs)); break; }
      case "openStatus": vscode.commands.executeCommand("vscode.open", vscode.Uri.file(m.file)); break;
      case "revealFolder": vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(folder)); break;
      case "result": post({ type: "result", file: m.file, ref: m.ref, i: m.i, data: await openResult(folder, m.ref) }); break;
      case "terminal": {
        const t = vscode.window.createTerminal({ name: e ? e.data.title : "resume", cwd: folder });
        t.show(); if (m.cmd) t.sendText(m.cmd, false);          // 명령을 넣어 두되 Enter 는 사용자가 (확인 후 실행)
        break;
      }
      case "claude": {                                            // 새 대화 / 최근 이어가기 / 이전 대화 골라 이어가기
        const pick = await pickClaudeSession(folder);
        if (!pick) break;
        const t = vscode.window.createTerminal({ name: "claude: " + (e ? e.data.title : ""), cwd: pick.cwd });
        t.show(); t.sendText(pick.cmd, true); break;
      }
    }
  });
}

function activate(context) {
  storageDir = context.globalStorageUri.fsPath; fs.mkdirSync(storageDir, { recursive: true });
  loadCache(); loadChat();
  try { refresh(true); } catch (e) { console.error(e); }
  context.subscriptions.push(
    vscode.commands.registerCommand("researchDashboard.open", () => openPanel(context)),
    vscode.commands.registerCommand("researchDashboard.refresh", () => { const n = refresh(true); post({ type: "data", ...cardsPayload() }); vscode.window.setStatusBarMessage(`Research Dashboard: ${n}개 갱신`, 3000); }),
    vscode.commands.registerCommand("researchDashboard.rebuild", () => { cache = { entries: {} }; refresh(true); post({ type: "data", ...cardsPayload() }); })
  );
  statusItem = vscode.window.createStatusBarItem("researchDashboard.status", vscode.StatusBarAlignment.Left, 10000);
  statusItem.name = "Research Dashboard";
  statusItem.text = "$(beaker) Research"; statusItem.tooltip = "Research Dashboard 열기"; statusItem.command = "researchDashboard.open"; statusItem.show();
  context.subscriptions.push(statusItem);
  // 처음 켜질 때 한 번: 어디서 여는지 알려 주는 알림
  const n = cardsPayload().items.length;
  vscode.window.showInformationMessage(`Research Dashboard 준비됨 (STATUS.md ${n}개). 상태 표시줄 왼쪽 "Research" 또는 명령 팔레트 "Research Dashboard: 열기"`, "열기")
    .then(a => { if (a === "열기") openPanel(context); });
  pollTimer = setInterval(() => { try { if (refresh(false)) post({ type: "data", ...cardsPayload() }); } catch {} }, Math.max(5, cfg().get("pollSeconds")) * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });
}
function deactivate() { saveCache(); }
module.exports = { activate, deactivate, _parseStatus: parseStatus, _findStatusFiles: findStatusFiles, _mdSection: mdSection, _setProject: setProject, _test: { ask, setPanel: p => { panel = p; }, buildPrompt, listSessions, firstPrompt } };
