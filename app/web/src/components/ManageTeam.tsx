import { useState, type FormEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MemberDTO } from "@shared/schemas";
import { api, ok, putImage } from "../lib/api";
import { fmtShort } from "../lib/format";
import { squarePhoto } from "../lib/image";
import { errorText, keys, useAction } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { Avatar, ConfirmButton } from "./ui";
import { ymd } from "@shared/time";

const units = (team: MemberDTO[]) => [...new Set(team.map(m => m.group).filter(Boolean))].sort();

function UnitField({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const { team, policy } = useViewer();
  if (!policy.isBoss) return <label className="field"><span>Unit</span><select className="input" name={name} defaultValue={defaultValue || policy.groups[0]}>{policy.groups.map(g => <option key={g}>{g}</option>)}</select></label>;
  return <label className="field"><span>Unit (mis. HCS, HCM)</span>
    <input className="input" name={name} list="unit-list" maxLength={20} placeholder="Kosongkan kalau tidak ada" style={{ textTransform: "uppercase" }} defaultValue={defaultValue} />
    <datalist id="unit-list">{units(team).map(g => <option key={g} value={g} />)}</datalist></label>;
}

