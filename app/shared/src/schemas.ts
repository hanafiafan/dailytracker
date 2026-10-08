import { z } from "zod";

export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const email = z.string().trim().toLowerCase().email().max(120);
const unit = z.string().trim().toUpperCase().max(20);

export const memberCreate = z.object({
  email, name: z.string().trim().min(1).max(40), role: z.string().trim().max(60).default(""), group: unit.default(""),
});
export const memberPatch = z.object({
  name: z.string().trim().min(1).max(40), role: z.string().trim().max(60), group: unit,
  isAdmin: z.boolean(), adminGroups: z.array(unit).max(20),
}).partial();
export const memberMove = z.object({ email });
export const memberOrder = z.object({ emails: z.array(z.string()).max(200) });

export const taskCreate = z.object({
  emails: z.array(email).min(1).max(100),
  title: z.string().trim().min(1).max(160),
  note: z.string().trim().max(600).default(""),
  date: date.optional(),
  start: hm.nullish(), due: hm.nullish(),
  hot: z.boolean().default(false),
  needProof: z.boolean().default(true),
  // Routine: appears automatically on the chosen weekdays (0 = Sunday).
  routineDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).refine(t => !(t.start && t.due) || t.start < t.due, { message: "Jam selesai harus setelah jam mulai", path: ["due"] });
export const taskStatus = z.object({ status: z.enum(STATUSES) });
export const taskReport = z.object({ report: z.string().trim().max(600) });
export const commentCreate = z.object({ text: z.string().trim().min(1).max(600) });
export const linkCreate = z.object({ title: z.string().trim().min(1).max(80), url: z.string().trim().url().max(500) });
export const pushSub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

// ---- shapes returned by the API ----
export interface MemberDTO {
  email: string; name: string; role: string; group: string; isAdmin: boolean; adminGroups: string[];
  sortOrder: number; hasPhoto: boolean; photoV: number; seenAt: number | null; askAt: number | null;
}
export interface CommentDTO { id: string; by: string; byEmail: string; text: string; at: number }
export interface TaskDTO {
  id: string; email: string; date: string; title: string; note: string; start: string | null; due: string | null;
  status: Status; hot: boolean; needProof: boolean; by: "owner" | "self"; fromAdmin: string | null; routineId: string | null;
  createdAt: number; startedAt: number | null; doneAt: number | null; returnedAt: number | null;
  proofLink: string | null; proofAt: number | null; hasPhoto: boolean; report: string | null; reportAt: number | null;
  comments: CommentDTO[];
}
export interface RoutineDTO { id: string; email: string; title: string; note: string; start: string | null; due: string | null; days: number[]; hot: boolean; needProof: boolean; byName: string | null }
export interface LinkDTO { id: string; title: string; url: string; createdAt: number }
export interface MeDTO { email: string; name: string; owner: boolean; member: MemberDTO | null }
