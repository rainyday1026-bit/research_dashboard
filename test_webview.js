// 패키지 전 검사: DOM 흉내로 webview.js 를 세 정렬 모드 + 질문 칸까지 그려 본다. 실행: node test_webview.js <cache.json>
const el = () => ({ _h: "", set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, dataset: {}, classList: { add() {}, remove() {} }, focus() {}, scrollTop: 0, scrollHeight: 0, value: "" });
global.document = { getElementById: () => el(), querySelectorAll: () => [] };
let handler; global.window = { addEventListener: (t, h) => handler = h };
global.acquireVsCodeApi = () => ({ getState: () => null, setState() {}, postMessage() {} });
require("./media/webview.js");
const items = JSON.parse(require("fs").readFileSync(process.argv[2] || "cache.json")).entries;
for (const mode of ["latest", "name", "custom"]) handler({ data: { type: "data", items: Object.values(items).map(e => e.data), sort: { mode, order: [], groups: ["새 묶음"], groupOrder: [], collapsed: ["(옛 형식)"] } } });
handler({ data: { type: "chat", chat: { sessionId: "x", messages: [{ role: "user", text: "q" }, { role: "assistant", text: "- a\n- b\n**x** `c`\n```\ncode\n```", usage: " (1/2)" }] }, busy: false } });
handler({ data: { type: "chat", chat: { messages: [] }, busy: true } });
console.log("webview render ok (latest/name/custom + chat)");
