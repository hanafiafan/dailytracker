import { useState } from "react";
import { api, ok } from "../lib/api";
import { fmtLong, fmtShort, fmtTime, isToday, today } from "../lib/format";
import { useAction, useTasks, windowFrom } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { InstallCard, NotifyCard } from "./Cards";
import { ProfileForm } from "./ManageTeam";
import { QuickAddSelf } from "./QuickAddSelf";
import { DateNav, Header } from "./Shell";
import { TaskRow } from "./TaskRow";
import { isIdle, splitDay } from "./PersonCard";
import { Avatar, Bar, tally } from "./ui";

export function MemberView({ date, onDate }: { date: string; onDate: (d: string) => void }) {
  const { me } = useViewer();
  const m = me.member!;
  const [editing, setEditing] = useState(false);
  const tq = useTasks(windowFrom(date, today()), true);
  const loaded = tq.isSuccess && !tq.isPlaceholderData;
  const mine = tq.data ?? [];
  const { day, late } = splitDay(mine, date);
  const all = day.concat(late), c = tally(all);
  const todayView = date === today();
  const ask = useAction(() => ok(api.ask.$post()), { done: "Permintaan tugas terkirim ke admin" });
  const asked = isToday(m.askAt);
  return (
    <>
      <Header narrow>
        <div className="brand me">
          <Avatar m={m} />
          <div><h1>Halo, {m.name}</h1><p>{m.role} · <button className="linkbtn" onClick={() => setEditing(e => !e)}>Ubah profil</button></p></div>
        </div>
        <DateNav date={date} onDate={onDate} />
      </Header>
      <main className="wrap narrow">
        {editing && <section className="hello"><h2 style={{ fontSize: "1.1rem" }}>Profil kamu</h2><ProfileForm m={m} onClose={() => setEditing(false)} /></section>}
        <InstallCard /><NotifyCard manager={false} />
        <section className="hello">
          <p className="muted">{fmtLong(date)}</p>
          <div className="big">{c.done} dari {all.length}<span> tugas selesai</span></div>
          <Bar c={c} total={all.length} />
        </section>
        {todayView && loaded && isIdle(mine) && (
          <section className="warnbox big" role="status">
            <span className="warnico" aria-hidden="true">!</span>
            {asked
              ? <div className="txt"><b>Permintaan terkirim jam {fmtTime(m.askAt!)}</b>Admin sudah diberi tahu. Tugas baru akan muncul di sini otomatis.</div>
              : <div className="txt"><b>Kamu tidak punya tugas aktif</b>{all.length ? "Semua tugas hari ini sudah selesai. Minta tugas berikutnya ke admin." : "Belum ada tugas untukmu hari ini. Minta tugas ke admin."}</div>}
            {!asked && <button className="btn primary" onClick={() => ask.mutate()}>Minta tugas ke admin</button>}
          </section>
        )}
        {late.length > 0 && <section className="list"><h2>Belum selesai dari hari sebelumnya</h2><ul className="tasks">{late.map(t => <TaskRow key={t.id} t={t} canDelete={t.by === "self"} isLate />)}</ul></section>}
        <section className="list">
          <h2>{todayView ? "Tugas hari ini" : "Tugas " + fmtShort(date)}</h2>
          {day.length ? <ul className="tasks">{day.map(t => <TaskRow key={t.id} t={t} canDelete={t.by === "self"} />)}</ul>
            : <p className="empty">{loaded ? "Belum ada tugas. Tugas dari atasan akan muncul di sini, atau tambahkan sendiri di bawah." : "Memuat…"}</p>}
          <QuickAddSelf email={m.email} date={date} />
        </section>
        <p className="foot">Ketuk status untuk menggantinya: Belum → Dikerjakan → Selesai. Atasan dan admin melihat progres ini; anggota tim lain tidak bisa melihat tugasmu.</p>
      </main>
    </>
  );
}
