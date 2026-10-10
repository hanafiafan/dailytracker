// Launch clean-up: removes the working data (tasks, projects and everything hanging off them) and keeps the team structure.
import { sql } from "drizzle-orm";
import type { Db } from "./db/index.js";

export interface ResetOptions { chat?: boolean; leaves?: boolean; acks?: boolean }

/** What each step removes, in the order they run. Tasks cascade to subtasks, comments, proofs, labels on tasks, time entries, their timeline and bell items. */
const steps = (o: ResetOptions) => [
  { label: "tugas (beserta checklist, komentar, bukti, timer, riwayat)", count: "SELECT count(*) FROM tasks", run: "DELETE FROM tasks" },
  { label: "tugas rutin", count: "SELECT count(*) FROM routines", run: "DELETE FROM routines" },
  { label: "proyek", count: "SELECT count(*) FROM projects", run: "DELETE FROM projects" },
  { label: "booking alat", count: "SELECT count(*) FROM bookings", run: "DELETE FROM bookings" },
  { label: "riwayat aktivitas", count: "SELECT count(*) FROM activity", run: "DELETE FROM activity" },
  { label: "notifikasi di lonceng", count: "SELECT count(*) FROM notifications", run: "DELETE FROM notifications" },
  ...(o.chat
    ? [
      { label: "semua pesan chat dan lampiran", count: "SELECT count(*) FROM messages", run: "DELETE FROM attachments; DELETE FROM messages; DELETE FROM channel_reads" },
      { label: "grup chat", count: "SELECT count(*) FROM chat_groups", run: "DELETE FROM chat_groups" },
    ]
    : [
      { label: "pesan chat kanal proyek dan lampirannya", count: "SELECT count(*) FROM messages WHERE channel LIKE 'p-%'", run: "DELETE FROM attachments WHERE channel LIKE 'p-%'; DELETE FROM messages WHERE channel LIKE 'p-%'; DELETE FROM channel_reads WHERE channel LIKE 'p-%'" },
    ]),
  ...(o.leaves ? [{ label: "pengajuan izin dan cuti", count: "SELECT count(*) FROM leaves", run: "DELETE FROM leaves" }] : []),
  ...(o.acks ? [{ label: "konfirmasi panduan (semua orang diminta konfirmasi lagi)", count: "SELECT count(*) FROM guide_acks", run: "DELETE FROM guide_acks" }] : []),
  { label: "tanda 'minta tugas' pada anggota", count: "SELECT count(*) FROM members WHERE ask_at IS NOT NULL", run: "UPDATE members SET ask_at = NULL" },
];
const KEPT = [
  ["anggota (nama, jabatan, unit, admin, atasan, foto)", "members"], ["label", "labels"], ["daftar alat dan studio", "resources"], ["tautan admin", "links"],
  ["perangkat notifikasi", "push_subs"], ["sesi login", "sessions"],
] as const;

export function planReset(db: Db, o: ResetOptions = {}) {
  const n = (q: string) => (db.sqlite.prepare(q).pluck().get() as number) ?? 0;
  const keptExtra = [...(o.leaves ? [] : [["pengajuan izin dan cuti", "leaves"] as const]), ...(o.chat ? [] : [["chat Umum dan grup", "chat_groups"] as const]), ...(o.acks ? [] : [["konfirmasi panduan", "guide_acks"] as const])];
  return {
    remove: steps(o).map(s => ({ label: s.label, n: n(s.count) })),
    keep: [...KEPT, ...keptExtra].map(([label, table]) => ({ label, n: n(`SELECT count(*) FROM ${table}`) })),
    placeholderEmails: db.sqlite.prepare("SELECT email FROM members WHERE email LIKE '%@belum-diisi.local' OR email LIKE '%.local'").pluck().all() as string[],
    admins: n("SELECT count(*) FROM members WHERE is_admin = 1"),
  };
}

/** Deletes inside one transaction; the caller is expected to have taken a backup first. */
export function applyReset(db: Db, o: ResetOptions = {}) {
  db.sqlite.transaction(() => { for (const s of steps(o)) db.sqlite.exec(s.run); })();
}
