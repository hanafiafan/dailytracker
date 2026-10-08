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

