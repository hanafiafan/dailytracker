import type { ActivityDTO, CommentDTO, LabelDTO, MemberDTO, NotificationDTO, ProjectDTO, RoutineDTO, SubtaskDTO, TaskDTO } from "@shared/schemas";
import type { activity, comments, labels, members, notifications, projects, routines, tasks } from "./db/schema.js";

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
export interface TaskExtras { comments?: CommentRow[]; labelIds?: string[]; subtasks?: SubtaskDTO[] }
export const toTask = (t: TaskRow, x: TaskExtras = {}): TaskDTO => ({
  id: t.id, email: t.email, date: t.date, title: t.title, note: t.note, start: t.start, due: t.due, status: t.status,
  hot: t.hot, priority: t.priority, projectId: t.projectId, labelIds: x.labelIds ?? [], subtasks: x.subtasks ?? [], needProof: t.needProof, by: t.by, fromAdmin: t.fromAdmin, routineId: t.routineId, createdAt: t.createdAt,
  startedAt: t.startedAt, doneAt: t.doneAt, returnedAt: t.returnedAt, proofLink: t.proofLink, proofAt: t.proofAt,
  hasPhoto: t.hasPhoto, report: t.report, reportAt: t.reportAt, comments: (x.comments ?? []).map(toComment),
});
export const toRoutine = (r: RoutineRow): RoutineDTO => ({
  id: r.id, email: r.email, title: r.title, note: r.note, start: r.start, due: r.due, days: r.days, hot: r.hot,
  needProof: r.needProof, byName: r.byName,
});
export const toProject = (p: typeof projects.$inferSelect): ProjectDTO => ({ id: p.id, name: p.name, color: p.color as ProjectDTO["color"], description: p.description, archived: p.archived, createdAt: p.createdAt });
export const toLabel = (l: typeof labels.$inferSelect): LabelDTO => ({ id: l.id, name: l.name, color: l.color as LabelDTO["color"] });
export const toNotification = (n: typeof notifications.$inferSelect): NotificationDTO => ({ id: n.id, kind: n.kind, taskId: n.taskId, text: n.text, at: n.at, read: n.readAt !== null });
export const toActivity = (a: typeof activity.$inferSelect, taskTitle: string | null = null): ActivityDTO => ({
  id: a.id, taskId: a.taskId, taskTitle, actorEmail: a.actorEmail, actorName: a.actorName, kind: a.kind, text: a.text, at: a.at,
});
