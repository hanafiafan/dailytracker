import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { makePolicy } from "@shared/policy";
import { Login } from "./components/Login";
import { MemberView } from "./components/MemberView";
import { OwnerView } from "./components/OwnerView";
import { Center, Loading } from "./components/ui";
import { today } from "./lib/format";
import { useLive, useMe, useTeam } from "./lib/queries";
import { registerPush, pushSupported } from "./lib/push";
import { ViewerContext, type Viewer } from "./lib/viewer";
import type { MeDTO } from "@shared/schemas";
import { UserChip } from "./components/Shell";

function Signed({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  useLive(qc, true);
  const teamQ = useTeam(true);
  const [date, setDate] = useState(today());
  const [, tick] = useReducer(n => n + 1, 0);
  const lastDay = useRef(today());

  // Roll the day over if the app stays open past midnight, and refresh "late" labels each minute.
  useEffect(() => {
    const id = setInterval(() => {
      const t = today();
      if (t !== lastDay.current) { const old = lastDay.current; lastDay.current = t; setDate(d => d === old ? t : d); }
      tick();
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  // Devices that already allowed notifications re-register on every start (subscriptions can expire).
  useEffect(() => { if (pushSupported() && Notification.permission === "granted") registerPush().catch(e => console.warn("push", e)); }, [me.email]);

  const viewer = useMemo<Viewer | null>(() => teamQ.data ? {
    me, team: teamQ.data, policy: makePolicy(me.email, me.owner, teamQ.data),
  } : null, [me, teamQ.data]);

  if (teamQ.isError) return <Center><p className="muted">Gagal memuat data. Periksa koneksi lalu muat ulang.</p></Center>;
  if (!viewer) return <Loading />;
  return (
    <ViewerContext value={viewer}>
      {viewer.policy.isManager ? <OwnerView date={date} onDate={setDate} />
        : me.member ? <MemberView date={date} onDate={setDate} />
        : <NotRegistered email={me.email} />}
    </ViewerContext>
  );
}

function NotRegistered({ email }: { email: string }) {
  return (
    <Center>
      <h1 style={{ fontSize: "1.5rem" }}>Email belum terdaftar</h1>
      <p className="muted">Kamu masuk sebagai <b>{email}</b>. Email ini belum ada di daftar tim.</p>
      <p className="muted">Kirim email ini ke pemilik aplikasi supaya ditambahkan, lalu buka aplikasi lagi. Atau keluar dan masuk dengan akun Google lain.</p>
      <div style={{ display: "flex", justifyContent: "center" }}><UserChip /></div>
    </Center>
  );
}

export function App() {
  const me = useMe();
  return (
    <>
      {me.isPending ? <Loading /> : me.data ? <Signed me={me.data} /> : <Login />}
      <Toaster position="bottom-center" richColors closeButton />
    </>
  );
}
