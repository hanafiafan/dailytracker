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

  // ---------- subscriptions ----------
  let teamUnsub = null;
  function subTeam() {
    teamUnsub = db.collection("team").onSnapshot(snap => {
      S.teamRaw = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name)));
      S.teamLoaded = true;
      syncSubs();
      markSeen();
      render();
    }, err => { console.warn(err); S.teamLoaded = true; render(); });
  }
  // Record (once a day) that this person has opened the app, so the owner sees who has signed in.
  let seenDone = false;
  function markSeen() {
    const m = myMember();
    if (seenDone || !m || S.owner) return;
    seenDone = true;
    if (m.seenAt && ymd(new Date(m.seenAt)) === today()) return;
    db.doc("team/" + m.id).update({ seenAt: Date.now() }).catch(e => console.warn(e));
  }
  function wantedKeys() {
    const m = myMember();
    if (isManager()) return S.team.filter(m => isBoss() || (!m.isAdmin && inScope(m))).map(keyOf);
    return m ? [S.meId] : [];
  }
  function subscribeKey(key) {
    const s = {};
    s.items = db.collection(`tasks/${key}/items`).where("date", ">=", S.winFrom).onSnapshot(snap => {
      S.items[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!snap.metadata.fromCache) S.itemsLoaded[key] = true;
      setTimeout(() => ensureRoutines(key), 0);
      render();
    }, err => console.warn(err));
    s.doc = db.doc(`tasks/${key}`).onSnapshot(snap => {
      S.keyDoc[key] = snap.exists ? snap.data() : {};
      if (!snap.metadata.fromCache) watchAsk(key, S.keyDoc[key]);
      if (!snap.metadata.fromCache) S.docLoaded[key] = true;
      setTimeout(() => ensureRoutines(key), 0);
      render();
    }, err => console.warn(err));
    subs[key] = s;
  }
  function syncSubs(force) {
    const want = new Set(wantedKeys());
    for (const k of Object.keys(subs)) {
      if (!want.has(k) || force) { subs[k].items(); subs[k].doc(); delete subs[k]; if (!want.has(k)) { delete S.items[k]; delete S.keyDoc[k]; } S.itemsLoaded[k] = false; }
    }
    for (const k of want) if (!subs[k]) subscribeKey(k);
  }

  // Create today's copies of daily routines, once per person per day.
  async function ensureRoutines(key) {
    const d = today();
    if (!(isManager() || key === S.meId)) return;
    if (S.readOnly || !S.itemsLoaded[key] || !S.docLoaded[key] || ensured.has(key + "|" + d)) return;
    ensured.add(key + "|" + d);
    const routines = (S.keyDoc[key] && S.keyDoc[key].routines) || [];
    const dow = parse(d).getDay();
    const have = new Set((S.items[key] || []).map(t => t.id));
    for (const r of routines) {
      if (!(r.days || []).includes(dow)) continue;
      const id = `r-${r.id}-${d}`;
      if (have.has(id)) continue;
      try {
        await db.doc(`tasks/${key}/items/${id}`).set({ title: r.title, note: r.note || "", date: d, start: r.start || null, due: r.due || null, status: "todo", hot: !!r.hot, needProof: r.needProof !== false, routine: r.id, by: "owner", createdAt: Date.now() });
      } catch (e) { console.warn(e); break; }
    }
  }

  // ---------- actions ----------
  function setDate(d) {
    S.date = d;
    if (d < S.winFrom) { S.winFrom = addDays(d, -14); syncSubs(true); }
    render();
  }
  function cycle(key, t) {
    const next = NEXT[t.status] || "doing";
    if (!isManager() && next === "done") { S.proofFor = key + "/" + t.id; render(); return; }
    safe(async () => {
      await db.doc(`tasks/${key}/items/${t.id}`).update({ status: next, doneAt: next === "done" ? Date.now() : null, ...(next === "done" ? { returnedAt: null } : {}), ...(next === "doing" && !t.startedAt ? { startedAt: Date.now() } : {}) });
    });
  }
  // Proof photos live in their own documents (proofs/<email>/items/<taskId>) and load on demand.
  const proofCache = {};
  function proofSrc(p, key, id) {
    if (!p || !p.photo) return null;
    const k = key + "/" + id;
    if (proofCache[k] === undefined) {
      proofCache[k] = null;
      db.doc(`proofs/${key}/items/${id}`).get()
        .then(d => { proofCache[k] = d.exists ? d.data().data : false; render(); })
        .catch(() => { proofCache[k] = false; render(); });
    }
    return proofCache[k] || null;
  }
  async function shrink(file, maxDim, q) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(r => c.toBlob(r, "image/jpeg", q));
    } finally { URL.revokeObjectURL(url); }
  }
  const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  async function pickProof(tag, file) {
    if (!file) return;
    try {
      const blob = await shrink(file, 1400, 0.72);
      if (!blob) throw new Error("no blob");
      const old = S.proofDraft[tag]; if (old) URL.revokeObjectURL(old.preview);
      S.proofDraft[tag] = { blob, file, preview: URL.createObjectURL(blob) };
      render();
    } catch (e) { toast("Foto tidak bisa dibaca. Coba screenshot atau foto format JPG/PNG."); }
  }
  function closeProof(tag) {
    const d = S.proofDraft[tag]; if (d) URL.revokeObjectURL(d.preview);
    delete S.proofDraft[tag]; S.proofFor = null; render();
  }
  async function submitProof(key, t, withoutProof) {
    const tag = key + "/" + t.id;
    const draft = S.proofDraft[tag];
    const linkEl = document.getElementById("pl-" + t.id), noteEl = document.getElementById("pn-" + t.id);
    let link = (linkEl && linkEl.value || "").trim();
    const note = (noteEl && noteEl.value || "").trim();
    if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
    if (!withoutProof && !draft && !link) return toast("Lampirkan foto/screenshot atau link sebagai bukti");
    S.busy = true; render();
    await safe(async () => {
      let proof = null;
      if (!withoutProof) {
        proof = { at: Date.now() };
        if (link) proof.link = link.slice(0, 500);
        if (draft) {
          let small = await shrink(draft.file, 1200, 0.62);
          let data = await toDataURL(small);
          if (data.length > 650000) { small = await shrink(draft.file, 800, 0.55); data = await toDataURL(small); }
          await db.doc(`proofs/${key}/items/${t.id}`).set({ data, at: Date.now() });
          proofCache[key + "/" + t.id] = data;
          proof.photo = true;
        }
      }
      const upd = { status: "done", doneAt: Date.now(), returnedAt: null };
      if (proof) upd.proof = proof;
      if (note) { upd.report = note; upd.reportAt = Date.now(); }
      await db.doc(`tasks/${key}/items/${t.id}`).update(upd);
      closeProof(tag);
    }, withoutProof ? "Tugas selesai" : "Tugas selesai dengan bukti");
    S.busy = false; render();
  }
  function sendBack(key, t) {
    const tag = "bk/" + key + "/" + t.id;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    safe(() => db.doc(`tasks/${key}/items/${t.id}`).update({ status: "doing", doneAt: null, returnedAt: Date.now() }), "Tugas dikembalikan. Tulis alasannya di catatan.");
  }
  function del(key, t) {
    const tag = key + "/" + t.id;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    safe(async () => {
      await db.doc(`tasks/${key}/items/${t.id}`).delete();
      if (t.proof && t.proof.photo) { try { await db.doc(`proofs/${key}/items/${t.id}`).delete(); } catch (_) {} }
    }, "Tugas dihapus");
  }
  const newTask = (title, extra) => ({ title, note: "", date: S.date, status: "todo", hot: false, createdAt: Date.now(), ...extra });
  function quickAdd(key, inputId, by) {
    const el = document.getElementById(inputId);
    const title = (el && el.value || "").trim();
    if (!title) { el && el.focus(); return; }
    el.value = "";
    const tEl = document.getElementById(inputId + "-t"); const due = (tEl && tEl.value) || null; if (tEl) tEl.value = "";
    const sEl = document.getElementById(inputId + "-s"); const start = (sEl && sEl.value) || null; if (sEl) sEl.value = "";
    safe(async () => { await db.collection(`tasks/${key}/items`).add(newTask(title, { by, start, due, needProof: by === "owner" })); if (by === "owner") await clearAsk(key); });
  }
  async function clearAsk(key) {
    const kd = S.keyDoc[key];
    if (kd && kd.askAt) await db.doc(`tasks/${key}`).update({ askAt: null });
  }
  const askWork = () => safe(() => db.doc(`tasks/${S.meId}`).set({ askAt: Date.now() }, { merge: true }), "Permintaan tugas terkirim ke admin");
  function openNote(key, t) {
    S.editNote = key + "/" + t.id; render();
    const el = document.getElementById("rep-" + t.id);
    if (el) { el.value = t.report || ""; el.focus(); }
  }
  function saveNote(key, t) {
    const el = document.getElementById("rep-" + t.id);
    const v = (el && el.value || "").trim();
    S.editNote = null;
    safe(() => db.doc(`tasks/${key}/items/${t.id}`).update({ report: v, reportAt: v ? Date.now() : null }), v ? "Catatan disimpan" : "Catatan dihapus");
  }
  function openAddFor(m) {
    S.showAdd = true; S.addSel = new Set([m.id]); render();
    setTimeout(() => { const el = document.getElementById("add-title"); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } }, 0);
  }
  async function submitAdd() {
    const title = document.getElementById("add-title").value.trim();
    const note = document.getElementById("add-note").value.trim();
    const dateEl = document.getElementById("add-date");
    const date = (dateEl && dateEl.value) || S.date;
    const due = (document.getElementById("add-time") || {}).value || null;
    const start = (document.getElementById("add-start") || {}).value || null;
    if (start && due && start >= due) return toast("Jam selesai harus setelah jam mulai");
    if (!S.addSel.size) return toast("Pilih minimal satu orang");
    if (!title) { document.getElementById("add-title").focus(); return toast("Tulis judul tugasnya dulu"); }
    if (S.addRoutine && !S.addDays.size) return toast("Pilih hari untuk tugas rutin");
    const people = S.team.filter(m => S.addSel.has(m.id));
    await safe(async () => {
      for (const m of people) {
        const key = keyOf(m);
        if (S.addRoutine) {
          const cur = (S.keyDoc[key] && S.keyDoc[key].routines) || [];
          const r = { id: Math.random().toString(36).slice(2, 9), title, note, hot: S.addHot, needProof: S.addProof, start, due, days: [...S.addDays].sort() };
          await db.doc(`tasks/${key}`).set({ ...(S.keyDoc[key] || {}), routines: [...cur, r] });
          const d = today();
          if (r.days.includes(parse(d).getDay())) await db.doc(`tasks/${key}/items/r-${r.id}-${d}`).set({ title, note, date: d, start, due, status: "todo", hot: S.addHot, needProof: S.addProof, routine: r.id, by: "owner", createdAt: Date.now() });
        } else {
          await db.collection(`tasks/${key}/items`).add({ title, note, date, start, due, status: "todo", hot: S.addHot, needProof: S.addProof, by: "owner", createdAt: Date.now() });
        }
        if (!S.addRoutine || (S.keyDoc[key] && S.keyDoc[key].askAt)) await clearAsk(key);
      }
    }, S.addRoutine ? "Tugas rutin disimpan" : `Tugas dibagikan ke ${people.length} orang`);
    S.addTime = ""; ["add-title", "add-note", "add-time", "add-start"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    S.addSel.clear(); S.addHot = false; S.addRoutine = false; S.addProof = true; S.showAdd = false;
    render();
  }
  function removeRoutine(key, rid) {
    const tag = "rt/" + key + "/" + rid;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    const cur = (S.keyDoc[key] && S.keyDoc[key].routines) || [];
    safe(() => db.doc(`tasks/${key}`).set({ ...(S.keyDoc[key] || {}), routines: cur.filter(r => r.id !== rid) }), "Tugas rutin dihentikan");
  }
  async function moveTasks(from, to) {
    if (!from || from === to) return;
    const snap = await db.collection(`tasks/${from}/items`).get();
    for (const d of snap.docs) {
      await db.doc(`tasks/${to}/items/${d.id}`).set({ ...d.data() });
      await db.doc(`tasks/${from}/items/${d.id}`).delete();
    }
    const pf = await db.collection(`proofs/${from}/items`).get();
    for (const d of pf.docs) {
      await db.doc(`proofs/${to}/items/${d.id}`).set({ ...d.data() });
      await db.doc(`proofs/${from}/items/${d.id}`).delete();
    }
    const kd = await db.doc(`tasks/${from}`).get();
    if (kd.exists) { await db.doc(`tasks/${to}`).set({ ...kd.data() }); await db.doc(`tasks/${from}`).delete(); }
  }
  const cleanEmail = v => (v || "").trim().toLowerCase();
  const validEmail = v => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v);
  function addMember() {
    const name = document.getElementById("mem-name").value.trim();
    const role = document.getElementById("mem-role").value.trim();
    const email = cleanEmail(document.getElementById("mem-email").value);
    const group = ((document.getElementById("mem-group") || {}).value || "").trim().toUpperCase();
    if (!name) return toast("Tulis nama anggota");
    if (!isBoss() && !myAdminGroups().includes(group)) return toast("Pilih unit yang kamu kelola");
    if (!validEmail(email)) return toast("Tulis email Google anggota dengan benar");
    if (S.team.some(m => m.id === email)) return toast("Email itu sudah dipakai anggota lain");
    const order = Math.max(0, ...S.team.map(m => m.order || 0)) + 1;
    ["mem-name", "mem-role", "mem-email"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    safe(() => db.doc("team/" + email).set({ name, role, order, ...(group ? { group } : {}) }), `${name} ditambahkan`);
  }
  async function saveSetup() {
    const rows = DEFAULT_TEAM.map((p, i) => ({ ...p, email: cleanEmail((document.getElementById("se-" + i) || {}).value) }));
    const filled = rows.filter(r => r.email);
    const bad = filled.find(r => !validEmail(r.email));
    if (bad) return toast(`Email untuk ${bad.name} belum benar`);
    if (!filled.length) return toast("Isi minimal satu email");
    const dup = filled.find((r, i) => filled.findIndex(x => x.email === r.email) !== i);
    if (dup) return toast(`Email ${dup.email} dipakai dua kali`);
    S.busy = true; render();
    await safe(async () => {
      let order = 0;
      for (const r of filled) await db.doc("team/" + r.email).set({ name: r.name, role: r.role, order: ++order, ...(r.isAdmin ? { isAdmin: true } : {}) });
    }, `${filled.length} anggota tim disimpan`);
    S.busy = false; render();
  }
  function removeMember(m) {
    const tag = "rm/" + m.id;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    safe(() => db.doc("team/" + m.id).delete(), `${m.name} dihapus dari tim`);
  }
  // ---------- pieces ----------
