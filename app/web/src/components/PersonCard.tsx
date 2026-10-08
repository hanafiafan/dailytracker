import type { MemberDTO, RoutineDTO, TaskDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN, fmtTime, isToday, today } from "../lib/format";
import { useAction } from "../lib/queries";
import { splitDay, isIdle } from "../lib/tasks";
import { Avatar, Bar, ConfirmButton, tally } from "./ui";
import { TaskRow } from "./TaskRow";

export function QuickAdd({ email, name }: { email: string; name: string }) {
  const add = useAction((f: FormData) => ok(api.tasks.$post({ json: {
    emails: [email], title: String(f.get("title")), start: String(f.get("start") || "") || null, due: String(f.get("due") || "") || null,
  } })));
  return (
    <form className="quick" onSubmit={e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      if (!String(f.get("title")).trim()) return;
      add.mutate(f, { onSuccess: () => (e.target as HTMLFormElement | null)?.reset?.() });
      e.currentTarget.reset();
    }}>
      <input className="input" name="title" placeholder={`Tugas untuk ${name}…`} maxLength={160} aria-label={`Tambah tugas untuk ${name}`} />
      <label className="tl"><span>Mulai</span><input className="input timein" name="start" type="time" aria-label={`Jam mulai tugas ${name}`} /></label>
      <label className="tl"><span>Selesai</span><input className="input timein" name="due" type="time" aria-label={`Jam selesai tugas ${name}`} /></label>
      <button className="btn" type="submit">Tambah</button>
    </form>
  );
}

export function PersonCard({ m, tasks, routines, date, loaded }: { m: MemberDTO; tasks: TaskDTO[]; routines: RoutineDTO[]; date: string; loaded: boolean }) {
  const { day, late } = splitDay(tasks, date);
  const all = day.concat(late), c = tally(all);
  const stop = useAction((id: string) => ok(api.routines[":id"].$delete({ param: { id } })), { done: "Tugas rutin dihentikan", refresh: [["tasks"], ["routines"]] });
  const asked = isToday(m.askAt);
  return (
    <article className="card">
      <div className="card-h">
        <Avatar m={m} />
        <div className="nm"><h3>{m.name}</h3><p>{[m.role, m.group].filter(Boolean).join(" · ")}</p></div>
        {m.seenAt ? <span className="tag on" title="Sudah pernah membuka aplikasi">Sudah masuk</span> : <span className="tag off" title="Belum membuka aplikasi">Belum masuk</span>}
      </div>
      <div className="meter"><Bar c={c} total={all.length} /><span>{c.done}/{all.length} selesai</span></div>
      {date === today() && loaded && isIdle(tasks) && (
        <div className="warnbox">
          <span className="warnico" aria-hidden="true">!</span>
          <div className="txt"><b>{asked ? `Minta tugas sejak ${fmtTime(m.askAt!)}` : "Tidak ada tugas aktif"}</b>{asked ? `${m.name} sudah menyelesaikan semua tugasnya.` : "Semua tugas selesai atau belum diberi tugas."}</div>
        </div>
      )}
      {late.length > 0 && <><div className="sub">Belum selesai sebelumnya</div><ul className="tasks">{late.map(t => <TaskRow key={t.id} t={t} canDelete isLate />)}</ul></>}
      {day.length ? <ul className="tasks">{day.map(t => <TaskRow key={t.id} t={t} canDelete />)}</ul>
        : !late.length && <p className="empty">{loaded ? "Belum ada tugas di tanggal ini." : "Memuat…"}</p>}
      {routines.length > 0 && (
        <div className="routines"><span>Rutin:</span>
          {routines.map(r => (
            <span className="rt" key={r.id}>
              {r.title}{r.start || r.due ? " " + [r.start, r.due].filter(Boolean).join("–") : ""} · {r.days.length === 7 ? "tiap hari" : [1, 2, 3, 4, 5, 6, 0].filter(d => r.days.includes(d)).map(d => DAYN[d]).join(" ")}
              <ConfirmButton className="" ariaLabel={"Hentikan tugas rutin " + r.title} label="×" armed="Yakin?" onConfirm={() => stop.mutate(r.id)} />
            </span>
          ))}
        </div>
      )}
      <QuickAdd email={m.email} name={m.name} />
    </article>
  );
}
