import { useMemo, useState } from "react";
import type { MemberDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { fmtLong, isToday, today } from "../lib/format";
import { useRoutines, useTasks, windowFrom } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { AddTaskPanel } from "./AddTaskPanel";
import { InstallCard, NotifyCard } from "./Cards";
import { Links } from "./Links";
import { ManageTeam } from "./ManageTeam";
import { PersonCard, isIdle, splitDay } from "./PersonCard";
import { Recap } from "./Recap";
import { DateNav, Header } from "./Shell";
import { Bar, tally } from "./ui";

export function OwnerView({ date, onDate }: { date: string; onDate: (d: string) => void }) {
  const { team, policy } = useViewer();
  const [unit, setUnit] = useState("");
  const [showAdd, setShowAdd] = useState<string[] | null>(null);
  const [showRecap, setShowRecap] = useState(false);
  const [recapDays, setRecapDays] = useState<7 | 14>(7);

  const from = windowFrom(addDays(date, -recapDays), today());
  const tq = useTasks(from, true);
  const rq = useRoutines(true);
  const loaded = tq.isSuccess && !tq.isPlaceholderData;
  const tasks = tq.data ?? [];
  const byPerson = useMemo(() => Map.groupBy(tasks, t => t.email), [tasks]);

  const allUnits = [...new Set(team.map(m => m.group).filter(Boolean))].sort();
  const myUnits = policy.isBoss ? allUnits : policy.groups;
  const workers = team.filter(m => !m.isAdmin && policy.canManage(m.email) && (!unit || m.group === unit));
  const manageable = team.filter(m => policy.isBoss || policy.canSee(m.email) && (m.email === policy.me || !m.isAdmin));

  let shown = [] as ReturnType<typeof splitDay>["day"];
  for (const m of workers) { const { day, late } = splitDay(byPerson.get(m.email) ?? [], date); shown = shown.concat(day, late); }
  const c = tally(shown), total = shown.length, pct = total ? Math.round(c.done / total * 100) : 0;
  const idle = loaded && date === today() ? workers.filter(m => isIdle(byPerson.get(m.email) ?? [])) : [];
  const asking = idle.filter(m => isToday(m.askAt));
  const routinesOf = (m: MemberDTO) => (rq.data ?? []).filter(r => r.email === m.email);

  return (
    <>
      <Header>
        <div className="brand"><h1>Tugas Harian Tim Kreatif</h1><p>{fmtLong(date)} · {workers.length} orang{policy.isBoss ? "" : " · Admin " + policy.groups.join(", ")}</p></div>
        <DateNav date={date} onDate={onDate} />
      </Header>
      <main className="wrap">
        <InstallCard /><NotifyCard manager />
        {myUnits.length > 1 && (
          <div className="chips unitbar" role="group" aria-label="Filter unit">
            <button className="chip" aria-pressed={!unit} onClick={() => setUnit("")}>Semua unit</button>
            {myUnits.map(g => <button key={g} className="chip" aria-pressed={unit === g} onClick={() => setUnit(g)}>{g}</button>)}
          </div>
        )}
        <section className="summary" aria-label="Ringkasan">
          <div>
            <div className="big">{pct}%<span>{total ? `selesai dari ${total} tugas` : "belum ada tugas"}</span></div>
            <Bar c={c} total={total} />
            <div className="counts">
              <span><i className="dot done" /><b>{c.done}</b> selesai</span><span><i className="dot doing" /><b>{c.doing}</b> dikerjakan</span><span><i className="dot todo" /><b>{c.todo}</b> belum</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn" aria-pressed={showRecap} onClick={() => setShowRecap(s => !s)}>{showRecap ? "Tutup rekap" : "Lihat rekap"}</button>
            <button className="btn primary" onClick={() => setShowAdd(s => s ? null : [])}>{showAdd ? "Tutup" : "+ Tambah tugas"}</button>
          </div>
        </section>
        <Links />
        {idle.length > 0 && (
          <section className="warnbox big" aria-label="Orang tanpa tugas">
            <span className="warnico" aria-hidden="true">!</span>
            <div className="txt">
              <b>{idle.length} orang tidak punya tugas aktif hari ini{asking.length ? `, ${asking.length} sudah minta tugas` : ""}</b>
              <div className="idle-list" style={{ marginTop: 6 }}>
                {idle.map(m => <button key={m.email} className="chip" title={"Beri tugas untuk " + m.name} onClick={() => setShowAdd([m.email])}>{isToday(m.askAt) ? "✋ " : ""}{m.name} +</button>)}
              </div>
            </div>
          </section>
        )}
        {showAdd && <AddTaskPanel key={showAdd.join()} people={workers} date={date} initial={showAdd} onClose={() => setShowAdd(null)} />}
        {showRecap && <Recap people={workers} tasks={tasks} date={date} days={recapDays} onDays={setRecapDays} onPick={onDate} loaded={loaded} />}
        {workers.length
          ? <section className="grid" aria-label="Tugas per orang">{workers.map(m => <PersonCard key={m.email} m={m} tasks={byPerson.get(m.email) ?? []} routines={routinesOf(m)} date={date} loaded={loaded} />)}</section>
          : <div className="panel"><h2>Daftar tim masih kosong</h2><p className="muted">Tambahkan anggota lewat Kelola tim di bawah.</p></div>}
        <ManageTeam list={manageable} />
      </main>
    </>
  );
}
