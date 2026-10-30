import { z } from "zod";

export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
/** Colour tokens for projects and labels; the web app maps each to a pastel surface. */
export const COLORS = ["lilac", "pink", "yellow", "lime", "mint", "sky", "peach", "gray"] as const;
export type Color = (typeof COLORS)[number] | (string & {});

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const email = z.string().trim().toLowerCase().email().max(120);
const unit = z.string().trim().toUpperCase().max(20);

export const LEVELS = ["Director", "Project Manager", "Lead", "Senior", "Staff", "Intern", "Client"] as const;
export type Level = (typeof LEVELS)[number];

export const ACCOUNT_TYPES = ["employee", "client"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const entityInput = z.object({
  id: z.string().trim().min(1).max(20).toUpperCase(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).default(""),
  color: z.string().trim().min(1).max(35).default("lilac"),
});
export const entityPatch = entityInput.omit({ id: true }).partial(); // the code is what members point at, so it never changes

export const projectServiceInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  status: z.enum(STATUSES).default("todo"),
  /** What the client bought, e.g. 100 + "foto"; 0 means no numeric target. */
  targetQty: z.number().int().min(0).max(100000).default(0),
  unit: z.string().trim().max(20).default(""),
  dueDate: date.nullish(),
  picEmails: z.array(email).max(30).default([]),
});
export const projectServicePatch = projectServiceInput.partial();

export const memberCreate = z.object({
  email,
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().max(60).default(""),
  group: unit.default(""),
  extraGroups: z.array(unit).max(10).default([]),
  jobdesk: z.string().trim().max(500).default(""),
  level: z.string().trim().max(40).default("Staff"),
  accountType: z.enum(ACCOUNT_TYPES).default("employee"),
  canCreateProject: z.boolean().default(false),
  canCommentAllProjects: z.boolean().default(false),
  allowedCommentProjectIds: z.array(z.string()).max(100).default([]),
});
export const memberPatch = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().max(60),
  group: unit,
  extraGroups: z.array(unit).max(10),
  isAdmin: z.boolean(),
  adminGroups: z.array(unit).max(20),
  managerEmail: email.nullable(),
  jobdesk: z.string().trim().max(500),
  level: z.string().trim().max(40),
  accountType: z.enum(ACCOUNT_TYPES),
  canCreateProject: z.boolean(),
  canCommentAllProjects: z.boolean(),
  allowedCommentProjectIds: z.array(z.string()).max(100),
}).partial();
export const memberMove = z.object({ email });
export const memberOrder = z.object({ emails: z.array(z.string()).max(200) });

export const taskCreate = z.object({
  emails: z.array(email).min(1).max(100),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(600).default(""),
  date: date.optional(),
  start: hm.nullish(), due: hm.nullish(),
  hot: z.boolean().default(false),
  priority: z.enum(PRIORITIES).default("normal"),
  projectId: z.string().nullish(),
  serviceId: z.string().nullish(),
  labelIds: z.array(z.string()).max(10).default([]),
  subtasks: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  needProof: z.boolean().default(true),
  warnMin: z.number().int().min(15).max(1440).nullish(),
  // Routine: appears automatically on the chosen weekdays (0 = Sunday).
  routineDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).refine(t => !(t.start && t.due) || t.start < t.due, { message: "Jam selesai harus setelah jam mulai", path: ["due"] });
/** Partial edit of a task: title/notes/schedule/priority/project/labels, or reassigning to someone else. */
export const taskPatch = z.object({
  title: z.string().trim().min(1).max(120), note: z.string().trim().max(600),
  date, start: hm.nullable(), due: hm.nullable(),
  priority: z.enum(PRIORITIES), projectId: z.string().nullable(), serviceId: z.string().nullable(), labelIds: z.array(z.string()).max(10),
  needProof: z.boolean(), email, warnMin: z.number().int().min(15).max(1440).nullable(), qty: z.number().int().min(0).max(100000),
}).partial();
export const subtaskCreate = z.object({ title: z.string().trim().min(1).max(160) });
export const subtaskPatch = z.object({ title: z.string().trim().min(1).max(160), done: z.boolean() }).partial();
const projectBase = z.object({
  name: z.string().trim().min(1).max(60), color: z.string().trim().min(1).max(35).default("lilac"), description: z.string().trim().max(300).default(""), archived: z.boolean().default(false),
  clientEmail: email.nullish(), pmEmail: email.nullish(), startDate: date.nullish(), dueDate: date.nullish(),
});
const periodOk = (p: { startDate?: string | null; dueDate?: string | null }) => !(p.startDate && p.dueDate) || p.startDate <= p.dueDate;
export const projectInput = projectBase.refine(periodOk, { message: "Tenggat harus setelah tanggal mulai", path: ["dueDate"] });
export const projectPatch = projectBase.partial().refine(periodOk, { message: "Tenggat harus setelah tanggal mulai", path: ["dueDate"] });
export const projectClose = z.object({
  summary: z.string().trim().max(1000).default(""),
  links: z.array(z.string().trim().url().max(500).refine(u => /^https?:\/\//i.test(u), "Hanya tautan http(s)")).max(10).default([]),
  force: z.boolean().default(false),
});
export const labelInput = z.object({ name: z.string().trim().min(1).max(30), color: z.string().trim().min(1).max(35).default("gray") });
export const LEAVE_KINDS = ["cuti", "izin", "sakit"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const httpUrl = z.string().trim().url().max(500).refine(u => /^https?:\/\//i.test(u), "Hanya tautan http(s)");
export const leaveCreate = z.object({ kind: z.enum(LEAVE_KINDS), from: date, to: date, reason: z.string().trim().max(200).default(""), proofLink: httpUrl.nullish() });
export const leaveDecision = z.object({ status: z.enum(["approved", "rejected"]) });
export const RESOURCE_KINDS = ["alat", "studio", "lokasi"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const resourceInput = z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(RESOURCE_KINDS).default("alat"), note: z.string().trim().max(200).default(""), archived: z.boolean().default(false) });
export const bookingCreate = z.object({ resourceId: z.string().min(1), date, start: hm, end: hm, taskId: z.string().nullish(), note: z.string().trim().max(200).default("") });
export const ChatRef = z.object({ type: z.enum(["member", "task", "project"]), id: z.string().min(1).max(80) });
export const messageCreate = z.object({ text: z.string().trim().max(2000).default(""), refs: z.array(ChatRef).max(20).default([]), attachmentIds: z.array(z.string()).max(6).default([]) });
export const pollCreate = z.object({
  question: z.string().trim().min(1, "Pertanyaan harus diisi").max(200),
  options: z.array(z.string().trim().min(1, "Pilihan tidak boleh kosong").max(100)).min(2, "Minimal 2 pilihan").max(10, "Maksimal 10 pilihan"),
  allowMultiple: z.boolean().default(false),
});
export const groupInput = z.object({ name: z.string().trim().min(1).max(40), description: z.string().trim().max(300).optional().default(""), emails: z.array(email).max(200).default([]) });
export const groupPatch = z.object({ name: z.string().trim().min(1).max(40).optional(), description: z.string().trim().max(300).optional(), emails: z.array(email).max(200).optional() });
export const notificationsRead = z.object({ ids: z.array(z.string()).max(200).optional() });
export const taskStatus = z.object({ status: z.enum(STATUSES) });
export const taskReport = z.object({ report: z.string().trim().max(600) });
export const commentCreate = z.object({ text: z.string().trim().min(1).max(600), mentions: z.array(email).max(10).default([]) });
export const linkCreate = z.object({ title: z.string().trim().min(1).max(80), url: z.string().trim().url().max(500) });
/** Info popup: an ordered list of content blocks the superadmin composes; every member sees it once. */
export const popupBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(120) }),
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("list"), style: z.enum(["bullet", "number", "check"]).default("bullet"), items: z.array(z.string().trim().min(1).max(200)).min(1).max(20) }),
  z.object({ type: z.literal("quote"), text: z.string().trim().min(1).max(500), by: z.string().trim().max(80).default("") }),
  z.object({ type: z.literal("accordion"), title: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("callout"), tone: z.enum(["info", "warn", "ok"]), text: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("image"), src: z.string().max(900_000).regex(/^data:image\/(jpeg|png|webp);base64,/), caption: z.string().trim().max(200).default("") }),
  z.object({ type: z.literal("video"), url: httpUrl }),
  z.object({ type: z.literal("button"), label: z.string().trim().min(1).max(60), url: httpUrl }),
]);
export type PopupBlock = z.infer<typeof popupBlock>;
export const popupInput = z.object({ title: z.string().trim().min(1).max(120), blocks: z.array(popupBlock).min(1).max(20), active: z.boolean() });
export interface PopupDTO { id: string; title: string; blocks: PopupBlock[]; active: boolean; createdAt: number }
export const pushSub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export const taskApproval = z.object({ status: z.enum(["approved", "rejected"]) });

export interface EntityDTO { id: string; name: string; description: string; color: Color; createdAt: number }
export interface ProjectServiceDTO { id: string; projectId: string; name: string; description: string; status: Status; createdAt: number; targetQty: number; unit: string; dueDate: string | null; picEmails: string[] }

// ---- shapes returned by the API ----
export interface MemberDTO {
  email: string; name: string; role: string; group: string; extraGroups: string[]; isAdmin: boolean; adminGroups: string[];
  sortOrder: number; hasPhoto: boolean; photoV: number; seenAt: number | null; askAt: number | null; managerEmail: string | null;
  jobdesk: string; level: string; accountType: AccountType; canCreateProject: boolean; canCommentAllProjects: boolean; allowedCommentProjectIds: string[];
}
export interface CommentDTO { id: string; by: string; byEmail: string; text: string; at: number }
export interface SubtaskDTO { id: string; title: string; done: boolean }
export interface ProjectDTO {
  id: string; name: string; color: Color; description: string; archived: boolean; createdAt: number; closedAt: number | null; closedBy: string | null; summary: string; links: string[];
  clientEmail: string | null; pmEmail: string | null; startDate: string | null; dueDate: string | null;
}
export interface LabelDTO { id: string; name: string; color: Color }
export interface ActivityDTO { id: string; taskId: string | null; taskTitle: string | null; actorEmail: string; actorName: string; kind: string; text: string; at: number }
export interface NotificationDTO { id: string; kind: string; taskId: string | null; text: string; at: number; read: boolean }
export interface PersonStat { email: string; name: string; total: number; done: number; onTime: number; late: number; open: number; overdue: number }
export interface AnalyticsDTO {
  from: string; to: string;
  totals: { total: number; done: number; open: number; overdue: number; onTimeRate: number | null; avgCompletionMin: number | null };
  perPerson: PersonStat[];
  daily: { date: string; created: number; done: number }[];
  byProject: { projectId: string | null; total: number; done: number }[];
  byPriority: Record<Priority, number>;
  byLabel: { labelId: string; total: number; done: number }[];
}
export interface TaskDTO {
  id: string; email: string; date: string; title: string; note: string; start: string | null; due: string | null;
  status: Status; hot: boolean; priority: Priority; projectId: string | null; serviceId: string | null; labelIds: string[]; subtasks: SubtaskDTO[]; needProof: boolean; warnMin: number | null; by: "owner" | "self"; fromAdmin: string | null; routineId: string | null;
  approvalStatus: "pending" | "approved" | "rejected"; approvedBy: string | null; approvedAt: number | null;
  qty: number;
  createdAt: number; startedAt: number | null; doneAt: number | null; returnedAt: number | null; revisions: number;
  revisionNote?: string | null;
  proofLink: string | null; proofAt: number | null; hasPhoto: boolean; report: string | null; reportAt: number | null;
  comments: CommentDTO[];
}
export interface RoutineDTO { id: string; email: string; title: string; note: string; start: string | null; due: string | null; days: number[]; hot: boolean; needProof: boolean; byName: string | null }
export interface LinkDTO { id: string; title: string; url: string; createdAt: number }
/** All-time figures for a project card: tasks, and per service how much was handed in against its target. */
export interface ProjectStatDTO { total: number; done: number; services: { target: number; delivered: number; unit: string; tasks: number; tasksDone: number }[] }
export interface MetaDTO { owner: { email: string; name: string }; projects: ProjectDTO[]; projectStats: Record<string, ProjectStatDTO>; labels: LabelDTO[]; entities?: EntityDTO[] }
/** Bump when the guide or its terms change materially: everyone is asked to confirm again. */
export const GUIDE_VERSION = 1;
export const guideAck = z.object({ version: z.number().int() });
export interface MeDTO { email: string; name: string; owner: boolean; member: MemberDTO | null; guideAck: { version: number; at: number } | null; /** True only when the server runs in local test mode (ALLOW_DEV_LOGIN): the first-run device setup is skipped. */ dev?: boolean }
export interface LeaveDTO { id: string; email: string; kind: LeaveKind; from: string; to: string; reason: string; proofLink: string | null; hasPhoto: boolean; status: "pending" | "approved" | "rejected"; decidedBy: string | null; decidedAt: number | null; createdAt: number }
export interface TimeEntryDTO { id: string; taskId: string; email: string; startedAt: number; endedAt: number | null }
export interface RunningTimerDTO { entry: TimeEntryDTO; taskTitle: string }
export interface TimeReportDTO {
  from: string; to: string; totalMin: number;
  perPerson: { email: string; name: string; min: number }[];
  byProject: { projectId: string | null; min: number }[];
  daily: { date: string; min: number }[];
}
export interface ProjectReportDTO {
  project: ProjectDTO;
  services?: ProjectServiceDTO[];
  stats: { total: number; done: number; open: number; onTime: number; late: number; minutes: number; withProof: number; revisions: number };
  tasks: { id: string; title: string; email: string; name: string; date: string; status: Status; priority: Priority; doneAt: number | null; hasPhoto: boolean; proofLink: string | null; report: string | null; minutes: number; revisions: number; serviceId?: string | null; qty: number; startedAt: number | null }[];
}
export interface ResourceDTO { id: string; name: string; kind: ResourceKind; note: string; archived: boolean }
export interface BookingDTO { id: string; resourceId: string; email: string; taskId: string | null; taskTitle: string | null; date: string; start: string; end: string; note: string }

export interface TaskRefDetailDTO {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  date: string;
  due: string | null;
  assigneeName?: string;
  assigneeEmail?: string;
  projectName?: string;
  projectColor?: string;
}

export interface ProjectRefDetailDTO {
  id: string;
  name: string;
  color: Color | string;
  description?: string;
  archived: boolean;
  totalTasks?: number;
  doneTasks?: number;
}

export interface ChatRefDTO {
  type: "member" | "task" | "project";
  id: string;
  label: string;
  ok: boolean;
  taskDetails?: TaskRefDetailDTO;
  projectDetails?: ProjectRefDetailDTO;
}

export interface PollOptionDTO {
  index: number;
  text: string;
  count: number;
  voterEmails: string[];
  voterNames: string[];
  hasVoted: boolean;
}

export interface PollDTO {
  id: string;
  messageId: string;
  channel: string;
  creatorEmail: string;
  creatorName: string;
  question: string;
  options: PollOptionDTO[];
  totalVotes: number;
  totalVoters: number;
  allowMultiple: boolean;
  isClosed: boolean;
  createdAt: number;
}

export interface AttachmentDTO { id: string; name: string; mime: string; size: number }
export interface MessageDTO {
  id: string;
  channel: string;
  email: string;
  name: string;
  text: string;
  refs: ChatRefDTO[];
  attachments: AttachmentDTO[];
  createdAt: number;
  deleted: boolean;
  isPinned?: boolean;
  pinnedAt?: number | null;
  pinnedBy?: string | null;
  pinnedByName?: string | null;
  poll?: PollDTO | null;
}
export interface AdminOverviewDTO {
  owner: string;
  counts: {
    totalMembers: number;
    employees: number;
    clients: number;
    admins: number;
    canCreateProjects: number;
    totalProjects: number;
    activeProjects: number;
    closedProjects: number;
    totalTasks: number;
    doneTasks: number;
    doingTasks: number;
    todoTasks: number;
    pendingApprovalTasks: number;
    totalEntities: number;
    totalMessages: number;
  };
  entityCounts: Record<string, number>;
}
export interface ChannelDTO {
  id: string;
  kind: "general" | "project" | "group" | "dm";
  name: string;
  description?: string;
  projectId: string | null;
  color: Color | null;
  unread: number;
  last: { text: string; name: string; at: number } | null;
  group?: { members: string[]; createdBy: string; canManage: boolean; description?: string; hasPhoto?: boolean; photoV?: number };
  dmUser?: { email: string; name: string; role: string; group?: string; jobdesk?: string; level?: string; hasPhoto: boolean; photoV: number };
  isSuperadminSession?: boolean;
}
