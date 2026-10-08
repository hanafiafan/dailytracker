import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LinkDTO, MeDTO, MemberDTO, RoutineDTO, TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { ApiError, api, ok } from "./api";

export const keys = {
  me: ["me"] as const, team: ["team"] as const, tasks: ["tasks"] as const, routines: ["routines"] as const, links: ["links"] as const,
};

/** null = not signed in. */
export const useMe = () => useQuery({
  queryKey: keys.me,
  queryFn: async (): Promise<MeDTO | null> => {
    const res = await api.me.$get();
    if (res.status === 401) return null;
    return (await ok(Promise.resolve(res))) as unknown as MeDTO;
  },
  staleTime: Infinity, retry: false,
});
export const useTeam = (enabled: boolean) => useQuery({ queryKey: keys.team, enabled, queryFn: () => ok(api.team.$get()) as unknown as Promise<MemberDTO[]> });
/** Tasks from `from` onward. */
export const useTasks = (from: string, enabled: boolean) => useQuery({
  queryKey: [...keys.tasks, from], enabled, placeholderData: prev => prev,
  queryFn: () => ok(api.tasks.$get({ query: { from } })) as unknown as Promise<TaskDTO[]>,
});
export const useRoutines = (enabled: boolean) => useQuery({ queryKey: keys.routines, enabled, queryFn: () => ok(api.routines.$get()) as unknown as Promise<RoutineDTO[]> });
export const useLinks = (enabled: boolean) => useQuery({ queryKey: keys.links, enabled, queryFn: () => ok(api.links.$get()) as unknown as Promise<LinkDTO[]> });

export const windowFrom = (date: string, today: string) => addDays(date < today ? date : today, -30);

/** Server-sent events: the server only says what changed; we refetch it. EventSource reconnects on its own. */
export function useLive(qc: QueryClient, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const es = new EventSource("/api/events");
    es.addEventListener("change", e => {
      const topic = (e as MessageEvent<string>).data;
      if (topic === "tasks") { void qc.invalidateQueries({ queryKey: keys.tasks }); void qc.invalidateQueries({ queryKey: keys.routines }); }
      else if (topic === "team") void qc.invalidateQueries({ queryKey: keys.team });
      else if (topic === "links") void qc.invalidateQueries({ queryKey: keys.links });
    });
    es.addEventListener("ready", () => void qc.invalidateQueries()); // after a reconnect, catch up on anything missed
    return () => es.close();
  }, [qc, active]);
}

export const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Gagal menyimpan. Periksa koneksi lalu coba lagi.";

/** Mutation that toasts success/failure and refreshes the given query groups. */
export function useAction<V = void>(fn: (v: V) => Promise<unknown>, opts: { done?: string | ((v: V) => string); refresh?: (readonly string[])[] } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, v) => {
      for (const k of opts.refresh ?? [keys.tasks, keys.team]) void qc.invalidateQueries({ queryKey: k });
      const m = typeof opts.done === "function" ? opts.done(v) : opts.done;
      if (m) toast.success(m);
    },
    onError: e => toast.error(errorText(e)),
  });
}
