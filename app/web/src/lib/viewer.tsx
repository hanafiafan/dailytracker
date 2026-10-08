import { createContext, useContext } from "react";
import type { MeDTO, MemberDTO } from "@shared/schemas";
import type { Policy } from "@shared/policy";

export interface Viewer { me: MeDTO; team: MemberDTO[]; policy: Policy }
export const ViewerContext = createContext<Viewer | null>(null);
export const useViewer = () => {
  const v = useContext(ViewerContext);
  if (!v) throw new Error("ViewerContext missing");
  return v;
};
