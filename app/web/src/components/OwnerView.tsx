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

