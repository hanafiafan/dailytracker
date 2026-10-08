import { db, mountGoogleButton, signOutUser as rawSignOut, onUser, pushSupported, registerPush, unregisterPush } from "./fb.js";
import { DEFAULT_TEAM } from "./config.js";

(() => {
  const app = document.getElementById("app");
  const DAYN = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const STATUS = { todo: "Belum", doing: "Dikerjakan", done: "Selesai" };
  const NEXT = { todo: "doing", doing: "done", done: "todo" };
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const fmtLong = s => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parse(s));
  const fmtShort = s => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(parse(s));
  const hue = str => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";

  const S = {
    mode: "loading", meId: null, owner: false,
    teamRaw: [], teamLoaded: false, editMember: null, photoDraft: undefined, tab: "pantau", ro: false, meName: "",
    items: {}, keyDoc: {}, itemsLoaded: {}, docLoaded: {},
    date: today(), winFrom: addDays(today(), -30),
    showAdd: false, addSel: new Set(), addRoutine: false, addDays: new Set([1, 2, 3, 4, 5, 6]), addHot: false,
    arm: null, toast: "", readOnly: false, recapDays: 7, editNote: null, showRecap: false, proofFor: null, proofDraft: {}, busy: false, lightbox: null, addProof: true,
  };
  const fmtTime = ms => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  const askedToday = key => { const kd = S.keyDoc[key]; return !!(kd && kd.askAt && ymd(new Date(kd.askAt)) === today()); };
  // Idle = nothing unfinished for today (including leftovers from earlier days).
  const isIdle = key => !!S.itemsLoaded[key] && !(S.items[key] || []).some(t => t.date <= today() && t.status !== "done");
  Object.defineProperty(S, "team", { get: () => S.teamRaw, configurable: true });
  const subs = {};
  const ensured = new Set();

  // ---------- helpers ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  let toastT;
  function toast(msg) { S.toast = msg; render(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = ""; render(); }, 3200); }
  async function safe(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) {
      const code = e && e.code;
      if (code === "permission-denied") toast("Kamu tidak punya izin untuk perubahan ini. Hubungi pemilik aplikasi.");
      else if (code === "resource-exhausted") toast("Batas harian database tercapai. Coba lagi besok atau hubungi pemilik.");
      else if (code === "unavailable") toast("Sedang offline. Perubahan akan tersimpan saat internet kembali.");
      else toast("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      console.warn(e);
    }
  }
  // Each person is keyed by their (lower-case) Google email.
  const keyOf = m => m.id;
  const myMember = () => S.team.find(m => m.id === S.meId);
  const keyFor = keyOf;
  // Roles: the owner and admins without a unit limit control everything ("boss");
  // an admin limited to units (e.g. HCS) manages only the people in those units.
  const myAdminGroups = () => { const m = myMember(); return m && m.isAdmin && Array.isArray(m.adminGroups) ? m.adminGroups : []; };
  const isManager = () => S.owner || !!(myMember() && myMember().isAdmin);
  const isBoss = () => S.owner || (isManager() && !myAdminGroups().length);
  const inScope = m => isBoss() || myAdminGroups().includes(m.group || "");
  const units = () => [...new Set(S.team.map(m => m.group).filter(Boolean))].sort();
  const myUnits = () => isBoss() ? units() : myAdminGroups();
  // Admins are kept out of the workforce lists; the optional unit filter narrows them further.
  const workers = () => S.team.filter(m => !m.isAdmin && inScope(m) && (!S.unit || (m.group || "") === S.unit));
  // People a manager may see in Kelola tim.
  const manageable = () => S.team.filter(m => isBoss() || m.id === S.meId || (!m.isAdmin && inScope(m)));
  const sortTasks = arr => arr.slice().sort((a, b) => {
    const st = { todo: 0, doing: 0, done: 1 };
    const da = a.start || a.due || "99:99", dbb = b.start || b.due || "99:99";
    return (st[a.status] - st[b.status]) || (da < dbb ? -1 : da > dbb ? 1 : 0) || ((b.hot ? 1 : 0) - (a.hot ? 1 : 0)) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || ((a.createdAt || 0) - (b.createdAt || 0));
  });
  const at = (date, hm) => { const d = parse(date); const [hh, mm] = hm.split(":").map(Number); d.setHours(hh, mm, 0, 0); return d.getTime(); };
  const deadline = t => t.due ? at(t.date, t.due) : null;
  const startAt = t => t.start ? at(t.date, t.start) : null;
  const dur = ms => { const m = Math.round(ms / 60000); if (m < 60) return m + " menit"; if (m < 1440) return Math.floor(m / 60) + " jam" + (m % 60 ? " " + (m % 60) + " mnt" : ""); return Math.floor(m / 1440) + " hari"; };
  function timeTags(t) {
    const dl = deadline(t), st = startAt(t), now = Date.now();
    const out = [];
    if (st || dl) out.push(h("span", { class: "tag due" }, "⏰ " + (t.start && t.due ? `${t.start}–${t.due}` : t.start ? "mulai " + t.start : "s/d " + t.due)));
    if (t.status === "done" && t.doneAt && dl) {
      const diff = t.doneAt - dl;
      out.push(diff <= 60000 ? h("span", { class: "tag on" }, "Tepat waktu") : h("span", { class: "tag late" }, "Telat " + dur(diff)));
    } else if (t.status !== "done" && dl && now > dl) {
      out.push(h("span", { class: "tag hot" }, "Terlambat " + dur(now - dl)));
    } else if (t.status === "todo" && st && now > st) {
      out.push(h("span", { class: "tag late" }, "Belum mulai · lewat " + dur(now - st)));
    }
    // Actual times, recorded when the status changes.
    if (t.startedAt) out.push(h("span", { class: "tag off" }, "Mulai " + fmtTime(t.startedAt)));
    if (t.status === "done" && t.doneAt) out.push(h("span", { class: "tag off" }, "Selesai " + fmtTime(t.doneAt)));
    return out;
  }
  function tasksFor(key) {
    const all = S.items[key] || [];
    const day = all.filter(t => t.date === S.date);
    const late = S.date === today() ? all.filter(t => t.date < S.date && t.status !== "done") : [];
    return { day: sortTasks(day), late: sortTasks(late) };
  }
  const tally = list => {
    const c = { todo: 0, doing: 0, done: 0 };
    for (const t of list) c[t.status in c ? t.status : "todo"]++;
    return c;
  };

