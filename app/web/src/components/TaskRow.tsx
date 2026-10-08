import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TaskDTO } from "@shared/schemas";
import { atMs } from "@shared/time";
import { api, ok, upload } from "../lib/api";
import { NEXT, STATUS, dur, fmtShort, fmtTime, host } from "../lib/format";
import { shrink } from "../lib/image";
import { errorText, keys, useAction } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { ConfirmButton } from "./ui";

function TimeTags({ t }: { t: TaskDTO }) {
  const now = Date.now();
  const dl = t.due ? atMs(t.date, t.due) : null, st = t.start ? atMs(t.date, t.start) : null;
  return <>
    {(st || dl) && <span className="tag due">⏰ {t.start && t.due ? `${t.start}–${t.due}` : t.start ? "mulai " + t.start : "s/d " + t.due}</span>}
    {t.status === "done" && t.doneAt && dl
      ? (t.doneAt - dl <= 60000 ? <span className="tag on">Tepat waktu</span> : <span className="tag late">Telat {dur(t.doneAt - dl)}</span>)
      : t.status !== "done" && dl && now > dl ? <span className="tag hot">Terlambat {dur(now - dl)}</span>
      : t.status === "todo" && st && now > st ? <span className="tag late">Belum mulai · lewat {dur(now - st)}</span> : null}
    {t.startedAt && <span className="tag off">Mulai {fmtTime(t.startedAt)}</span>}
    {t.status === "done" && t.doneAt && <span className="tag off">Selesai {fmtTime(t.doneAt)}</span>}
  </>;
}

