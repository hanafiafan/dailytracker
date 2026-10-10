import { GUIDE_VERSION } from "@shared/schemas";
import { AckForm, GuideView, ackedAt } from "../components/GuideView";
import { Page } from "../components/Page";
import { GUIDE } from "../lib/guide";
import { useViewer } from "../lib/viewer";

/** Only the guide for the signed-in account's own role. */
export function GuidePage() {
  const { me, policy } = useViewer();
  const role = policy.guideRole();
  const acked = me.guideAck?.version === GUIDE_VERSION ? me.guideAck : null;
  return (
    <Page title="Panduan" sub={`Akunmu: ${GUIDE[role].label}`} noNew>
      <GuideView role={role} />
      <section className="bc ack">
        {acked ? <p><b>Sudah dikonfirmasi</b> pada {ackedAt(acked.at)}. Kamu bisa membaca panduan ini kapan saja.</p> : <AckForm />}
      </section>
    </Page>
  );
}
