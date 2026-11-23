const $ = s => document.querySelector(s);
const MODE = document.body.dataset.mode;
const BASE = document.body.dataset.base;
const GROUPS = [["", "全部", "#b7c4be"], ["資訊管理", "資訊管理", "#35b58a"], ["應用外語", "應用外語", "#f3b9c9"], ["企業管理", "企業管理", "#e0b100"]];
const state = { meta: null, user: null, term: "", group: "", picks: [], rows: [] };

const api = MODE === "flask" ? {
  async call(method, url, body) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "發生錯誤");
    return j;
  },
  meta() { return this.call("GET", "/api/meta"); },
  courses(q) { return this.call("GET", "/api/courses?" + new URLSearchParams(q)); },
  login(b) { return this.call("POST", "/api/login", b).then(j => j.user); },
  logout() { return this.call("POST", "/api/logout"); },
  picks(t) { return this.call("GET", `/api/picks/${t}`); },
  add(t, id) { return this.call("POST", `/api/picks/${t}/${encodeURIComponent(id)}`); },
  drop(t, id) { return this.call("DELETE", `/api/picks/${t}/${encodeURIComponent(id)}`); },
} : {
  data: null, map: null,
  store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } },
  async load() {
    if (!this.data) {
      this.data = await (await fetch(BASE + "static/courses.json")).json();
      this.map = Object.fromEntries(this.data.courses.map(c => [c.id, c]));
    }
    return this.data;
  },
  async meta() { const d = await this.load(); return { terms: d.terms, depts: d.depts, days: d.days, user: this.store("ntub_user"), max_credit: 25 }; },
  async courses(q) { const d = await this.load(); return d.courses.filter(c => match(c, q)); },
  async login(b) { if (!b.sid || !b.pw) throw new Error("請輸入學號與密碼"); const u = { sid: b.sid, name: b.name || `同學 ${b.sid.slice(-3)}` }; this.store("ntub_user", u); return u; },
  async logout() { localStorage.removeItem("ntub_user"); localStorage.removeItem("ntub_picks"); },
  all() { return this.store("ntub_picks") || {}; },
  async picks(t) { await this.load(); return (this.all()[t] || []).map(i => this.map[i]).filter(Boolean); },
  async add(t, id) {
    const c = this.map[id], mine = await this.picks(t), err = checkAdd(c, mine, 25);
    if (err) throw new Error(err);
    const all = this.all(); (all[t] ||= []).push(id); this.store("ntub_picks", all);
    return this.picks(t);
  },
  async drop(t, id) { const all = this.all(); all[t] = (all[t] || []).filter(i => i !== id); this.store("ntub_picks", all); return this.picks(t); },
};

function match(c, a) {
  if (a.term && c.term !== a.term) return false;
  if (a.group && c.group !== a.group) return false;
  if (a.edu && c.edu !== a.edu) return false;
  if (a.dept && c.dept !== a.dept) return false;
  if (a.kind && !c.kind.includes(a.kind)) return false;
  if (a.day && !c.slots.some(s => String(s[0]) === a.day)) return false;
  const q = (a.q || "").trim().toLowerCase();
  if (q && ![c.name, c.code, c.cls, ...c.teachers].join(" ").toLowerCase().includes(q)) return false;
  return true;
}

function checkAdd(c, mine, max) {
  if (mine.some(m => m.id === c.id)) return "已在課表中";
  if (mine.some(m => m.code === c.code)) return "已選過相同科目";
  if (c.limit && c.taken >= c.limit) return "人數已額滿";
  if (mine.reduce((s, m) => s + m.credit, 0) + c.credit > max) return `超過學分上限 ${max}`;
  for (const [d, p] of c.slots) {
    const hit = mine.find(m => m.slots.some(s => s[0] === d && s[1] === p));
    if (hit) return `與「${hit.name}」衝堂`;
  }
  return null;
}

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const termLabel = t => { const [y, s] = t.split("-"); return `${y} 學年度第 ${s} 學期`; };

function timeText(c) {
  if (!c.slots.length) return "未定";
  const byDay = {};
  c.slots.forEach(([d, p]) => (byDay[d] ||= []).push(p));
  return Object.entries(byDay).map(([d, ps]) => `${state.meta.days[d - 1] || d} ${ps.join("、")}`).join("／");
}

function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(t._h); t._h = setTimeout(() => t.className = "toast", 2200);
}

function renderWho() {
  const u = state.user;
  $("#who").innerHTML = u
    ? `<i class="dot"></i><span>${esc(u.name)}（${esc(u.sid)}）</span><button class="btn ghost sm" id="logout">登出</button>`
    : `<button class="btn sm" id="open-login">登入</button>`;
  $("#open-login")?.addEventListener("click", () => $("#login").showModal());
  $("#logout")?.addEventListener("click", async () => { await api.logout(); state.user = null; state.picks = []; renderWho(); renderRows(); renderTable(); toast("已登出"); });
}

function fillSelect(el, items, all) {
  el.innerHTML = (all ? `<option value="">${all}</option>` : "") + items.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
}

function refreshFilters() {
  const rx = { 資訊管理: /資訊管理|資管/, 應用外語: /應用外語|應外/, 企業管理: /企業管理|企管/ }[state.group];
  const ready = state.meta.depts.filter(d => d.ready && (!rx || rx.test(d.dept)));
  const edu = $("#f-edu").value;
  const edus = [...new Set(ready.map(d => d.edu))];
  fillSelect($("#f-edu"), edus.map(e => [e, e]), "全部學制");
  if (edus.includes(edu)) $("#f-edu").value = edu;
  const ds = ready.filter(d => !$("#f-edu").value || d.edu === $("#f-edu").value);
  fillSelect($("#f-dept"), [...new Set(ds.map(d => d.dept))].map(d => [d, d]), "全部系所");
}

function renderGroups() {
  $("#groups").innerHTML = GROUPS.map(([v, t, c]) => `<button type="button" data-g="${v}" aria-selected="${state.group === v}"><i style="background:${c}"></i>${t}</button>`).join("");
  $("#groups").querySelectorAll("button").forEach(b => b.onclick = () => { state.group = b.dataset.g; renderGroups(); refreshFilters(); search(); });
}

async function search() {
  const q = Object.fromEntries(new FormData($("#sform")));
  q.group = state.group;
  state.term = q.term;
  state.rows = await api.courses(q);
  if (state.user) state.picks = await api.picks(state.term);
  renderRows();
}

function renderRows() {
  const rows = state.rows, ids = new Set(state.picks.map(p => p.id));
  $("#count").textContent = `${termLabel(state.term)}・共 ${rows.length} 門課程`;
  $("#empty").hidden = rows.length > 0;
  const shown = rows.slice(0, 400);
  $("#rows").innerHTML = shown.map(c => {
    const full = c.limit && c.taken >= c.limit;
    const kindTag = c.kind.includes("必") ? "tag" : c.kind.includes("選") ? "tag warn" : "tag off";
    const act = !state.user ? `<button class="btn ghost sm" data-login>登入選課</button>`
      : ids.has(c.id) ? `<button class="btn danger sm" data-drop="${esc(c.id)}">退選</button>`
      : `<button class="btn sm" data-add="${esc(c.id)}" ${full ? "disabled" : ""}>${full ? "額滿" : "加選"}</button>`;
    return `<tr><td>${esc(c.code)}<span class="sub">${esc(c.cls)}</span></td>
      <td><button class="cname" data-info="${esc(c.id)}">${esc(c.name)}</button></td>
      <td class="hm">${esc(c.teachers.join("、"))}</td>
      <td>${esc(timeText(c))}<span class="sub">${esc(c.room)}</span></td>
      <td>${c.credit}</td>
      <td class="hm">${c.taken}/${c.limit}</td>
      <td><span class="${kindTag}">${esc(c.kind)}</span></td><td>${act}</td></tr>`;
  }).join("") + (rows.length > shown.length ? `<tr><td colspan="8" class="note">僅顯示前 ${shown.length} 筆，請加上篩選條件</td></tr>` : "");
  renderMini();
}

function renderMini() {
  const cr = state.picks.reduce((s, p) => s + p.credit, 0);
  $("#credit-mini").textContent = state.user ? `已選 ${state.picks.length} 門・${cr} 學分` : "登入後即可加選課程";
}

function renderTable() {
  const picks = state.picks, days = state.meta.days;
  const cr = picks.reduce((s, p) => s + p.credit, 0);
  $("#stats").innerHTML = `<div>學期<b style="font-size:20px">${termLabel(state.term)}</b></div><div>已選課程<b>${picks.length}</b></div><div>總學分<b>${cr}</b></div><div>學分上限<b>${state.meta.max_credit}</b></div>`;
  const ps = picks.flatMap(p => p.slots.map(s => s[1]));
  const maxP = Math.max(9, ...ps), useDays = Math.max(5, ...picks.flatMap(p => p.slots.map(s => s[0])));
  let h = `<tr><th style="width:56px"></th>${[...Array(useDays)].map((_, i) => `<th>週${days[i]}</th>`).join("")}</tr>`;
  for (let p = 1; p <= maxP; p++) {
    h += `<tr><td class="p">${p}</td>`;
    for (let d = 1; d <= useDays; d++) {
      const c = picks.find(x => x.slots.some(s => s[0] === d && s[1] === p));
      h += c ? `<td class="on">${esc(c.name)}<span class="sub">${esc(c.room)}</span></td>` : `<td></td>`;
    }
    h += "</tr>";
  }
  $("#tt").innerHTML = state.user ? h : `<tr><td class="empty" style="background:none">請先登入</td></tr>`;
  $("#mine-empty").hidden = picks.length > 0;
  $("#mine").innerHTML = picks.map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.name)}</td><td class="hm">${esc(c.teachers.join("、"))}</td><td>${esc(timeText(c))}<span class="sub">${esc(c.room)}</span></td><td>${c.credit}</td><td><button class="btn danger sm" data-drop="${esc(c.id)}">退選</button></td></tr>`).join("");
}

function renderDepts() {
  const by = {};
  state.meta.depts.forEach(d => (by[d.edu] ||= []).push(d));
  $("#dgrid").innerHTML = Object.entries(by).map(([e, ds]) => `<div class="dcard"><h4>${esc(e)}</h4><ul>${ds.map(d => `<li>${esc(d.dept)}<span class="tag ${d.ready ? "" : "off"}">${d.ready ? "已開放" : "準備中"}</span></li>`).join("")}</ul></div>`).join("");
}

function showInfo(id) {
  const c = state.rows.find(x => x.id === id) || state.picks.find(x => x.id === id);
  if (!c) return;
  $("#dbody").innerHTML = `<h3>${esc(c.name)}<small>${esc(c.code)}</small></h3><table class="kv">
    <tr><th>學期</th><td>${termLabel(c.term)}</td></tr><tr><th>學制</th><td>${esc(c.edu)}</td></tr>
    <tr><th>系所</th><td>${esc(c.dept)}</td></tr><tr><th>開課班級</th><td>${esc(c.cls)}（序號 ${esc(c.seq)}）</td></tr>
    <tr><th>任課教師</th><td>${esc(c.teachers.join("、"))}</td></tr><tr><th>上課時間</th><td>${esc(timeText(c))}</td></tr>
    <tr><th>教室</th><td>${esc(c.room)}</td></tr><tr><th>學分／時數</th><td>${c.credit} 學分・${c.hours} 小時</td></tr>
    <tr><th>修課人數</th><td>${c.taken} / ${c.limit}</td></tr><tr><th>類別</th><td>${esc(c.kind)}</td></tr></table>`;
  $("#detail").showModal();
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.close !== undefined) t.closest("dialog").close();
  else if (t.dataset.login !== undefined) $("#login").showModal();
  else if (t.dataset.info) showInfo(t.dataset.info);
  else if (t.dataset.add || t.dataset.drop) {
    try {
      const add = !!t.dataset.add, id = t.dataset.add || t.dataset.drop;
      state.picks = add ? await api.add(state.term, id) : await api.drop(state.term, id);
      toast(add ? "加選成功" : "已退選");
      renderRows(); renderTable();
    } catch (err) { toast(err.message, true); }
  }
});

document.querySelectorAll("nav.bar button").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav.bar button").forEach(x => x.setAttribute("aria-selected", x === b));
  ["search", "table", "depts"].forEach(v => $("#v-" + v).hidden = v !== b.dataset.view);
  if (b.dataset.view === "table") renderTable();
  scrollTo({ top: 0 });
});

$("#sform").addEventListener("submit", e => { e.preventDefault(); search(); });
$("#sform").addEventListener("reset", () => setTimeout(() => { $("#f-term").value = state.meta.terms[0]; refreshFilters(); search(); }));
$("#f-edu").addEventListener("change", () => { refreshFilters(); search(); });
["#f-term", "#f-dept", "#f-day"].forEach(s => $(s).addEventListener("change", search));

$("#lform").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    state.user = await api.login(Object.fromEntries(new FormData(e.target)));
    e.target.reset(); $("#login").close(); renderWho();
    state.picks = await api.picks(state.term); renderRows(); renderTable();
    toast(`歡迎，${state.user.name}`);
  } catch (err) { toast(err.message, true); }
});

(async () => {
  state.meta = await api.meta();
  state.user = state.meta.user;
  fillSelect($("#f-term"), state.meta.terms.map(t => [t, termLabel(t)]));
  fillSelect($("#f-day"), [...state.meta.days].slice(0, 7).map((d, i) => [String(i + 1), "星期" + d]), "全部");
  renderWho(); renderGroups(); refreshFilters(); renderDepts();
  await search();
})();
