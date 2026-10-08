import type { CommentDTO, MemberDTO, RoutineDTO, TaskDTO } from "@shared/schemas";
import type { comments, members, routines, tasks } from "./db/schema.js";

type MemberRow = typeof members.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;
type CommentRow = typeof comments.$inferSelect;
type RoutineRow = typeof routines.$inferSelect;

export const toMember = (m: MemberRow): MemberDTO => ({
  email: m.email, name: m.name, role: m.role, group: m.group, isAdmin: m.isAdmin, adminGroups: m.adminGroups,
  sortOrder: m.sortOrder, hasPhoto: m.photo !== null && m.photoV > 0, photoV: m.photoV, seenAt: m.seenAt, askAt: m.askAt,
});
// Member rows are selected without the photo bytes in lists; this keeps the flag correct there.
export const toMemberLite = (m: Omit<MemberRow, "photo">): MemberDTO => ({
  email: m.email, name: m.name, role: m.role, group: m.group, isAdmin: m.isAdmin, adminGroups: m.adminGroups,
  sortOrder: m.sortOrder, hasPhoto: m.photoV > 0, photoV: m.photoV, seenAt: m.seenAt, askAt: m.askAt,
});
export const toComment = (c: CommentRow): CommentDTO => ({ id: c.id, by: c.by, byEmail: c.byEmail, text: c.text, at: c.at });
export const toTask = (t: TaskRow, cs: CommentRow[] = []): TaskDTO => ({
  id: t.id, email: t.email, date: t.date, title: t.title, note: t.note, start: t.start, due: t.due, status: t.status,
  hot: t.hot, needProof: t.needProof, by: t.by, fromAdmin: t.fromAdmin, routineId: t.routineId, createdAt: t.createdAt,
  startedAt: t.startedAt, doneAt: t.doneAt, returnedAt: t.returnedAt, proofLink: t.proofLink, proofAt: t.proofAt,
  hasPhoto: t.hasPhoto, report: t.report, reportAt: t.reportAt, comments: cs.map(toComment),
});
export const toRoutine = (r: RoutineRow): RoutineDTO => ({
  id: r.id, email: r.email, title: r.title, note: r.note, start: r.start, due: r.due, days: r.days, hot: r.hot,
  needProof: r.needProof, byName: r.byName,
});
