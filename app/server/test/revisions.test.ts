import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, setup } from "./helpers.js";

type J = Record<string, any>;
const json = async (r: Response) => (await r.json()) as J;

describe("10 Revisi Features", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("Poin 1: Project Services CRUD and task serviceId attachment", async () => {
    // Create project
    const pRes = await t.call(OWNER, "POST", "/meta/projects", { name: "Website Rebranding" });
    const p = await json(pRes);

    // Add services to project
    const s1Res = await t.call(OWNER, "POST", `/meta/projects/${p.id}/services`, {
      name: "Web Development",
      description: "Frontend & Backend setup",
      status: "doing",
    });
    expect(s1Res.status).toBe(201);
    const s1 = await json(s1Res);
    expect(s1.name).toBe("Web Development");
    expect(s1.projectId).toBe(p.id);

    // Get services
    const getList = await json(await t.call("a@x.id", "GET", `/meta/projects/${p.id}/services`));
    expect(getList.length).toBe(1);
    expect(getList[0].id).toBe(s1.id);

    // Create task under this project & service
    const tRes = await t.call(OWNER, "POST", "/tasks", {
      emails: ["a@x.id"],
      title: "Setup landing page",
      projectId: p.id,
      serviceId: s1.id,
    });
    expect(tRes.status).toBe(201);
    const { ids } = await json(tRes);

    const tasksList = (await json(await t.call("a@x.id", "GET", `/tasks?from=2000-01-01`))) as unknown as J[];
    const createdTask = tasksList[0];
    expect(createdTask).toBeDefined();
    expect(createdTask!.id).toBe(ids[0]);
    expect(createdTask!.serviceId).toBe(s1.id);
  });

  it("Poin 2: Task comments authorization (creator, director, assignee, allowed permissions)", async () => {
    const tRes = await t.call("hcs@x.id", "POST", "/tasks", {
      emails: ["a@x.id"],
      title: "Desain Banner",
    });
    const { ids } = await json(tRes);
    const taskId = ids[0];

    // Creator (hcs@x.id) can comment
    const c1 = await t.call("hcs@x.id", "POST", `/tasks/${taskId}/comments`, { text: "Tolong revisi warna" });
    expect(c1.status).toBe(201);

    // Assignee (a@x.id) can comment
    const c2 = await t.call("a@x.id", "POST", `/tasks/${taskId}/comments`, { text: "Siap pak, sudah diperbaiki" });
    expect(c2.status).toBe(201);

    // Superadmin (OWNER) can comment
    const c3 = await t.call(OWNER, "POST", `/tasks/${taskId}/comments`, { text: "Nice work" });
    expect(c3.status).toBe(201);
  });

  it("Poin 3: Direct Messages (DM) between members", async () => {
    // Create or get DM channel between a@x.id and b@x.id
    const dmRes = await t.call("a@x.id", "POST", "/chat/dm", {
      targetEmail: "b@x.id",
    });
    expect(dmRes.status).toBe(200);
    const dmData = await json(dmRes);
    expect(dmData.channelId).toMatch(/^dm:/);

    // Send message to DM channel
    const msgRes = await t.call("a@x.id", "POST", `/chat/channels/${dmData.channelId}/messages`, {
      text: "Halo B, apa kabar?",
      refs: [],
      attachmentIds: [],
    });
    expect(msgRes.status).toBe(201);

    // Channels list shows the DM channel
    const channelsA = (await json(await t.call("a@x.id", "GET", "/chat/channels"))) as unknown as J[];
    const dmChan = channelsA.find(c => c.id === dmData.channelId);
    expect(dmChan).toBeDefined();
    expect(dmChan?.kind).toBe("dm");
    expect(dmChan?.dmUser?.email).toBe("b@x.id");
  });

  it("Poin 4: Project creation permissions and switch", async () => {
    // Ordinary member without permission cannot create project
    const fail = await t.call("a@x.id", "POST", "/meta/projects", { name: "Proyek Ilegal" });
    expect(fail.status).toBe(403);

    // Superadmin updates member with canCreateProject: true
    const patchRes = await t.call(OWNER, "PATCH", "/team/a@x.id", { canCreateProject: true });
    expect(patchRes.status).toBe(200);

    // Now a@x.id can create project
    const ok = await t.call("a@x.id", "POST", "/meta/projects", { name: "Proyek Legal A" });
    expect(ok.status).toBe(201);
  });

  it("Poin 5: Vero (Project Manager) can assign tasks across any entity", async () => {
    // Vero assigns to b@x.id (in ADS entity) and a@x.id (in HCS entity)
    const res = await t.call("vero@x.id", "POST", "/tasks", {
      emails: ["a@x.id", "b@x.id", "vero@x.id"],
      title: "Sprint Review Lintas Entitas",
    });
    expect(res.status).toBe(201);
  });

  it("Poin 8: Entities CRUD by Superadmin", async () => {
    // Only superadmin can create entity
    const fail = await t.call("a@x.id", "POST", "/meta/entities", { id: "NEW", name: "New Unit", color: "sky" });
    expect(fail.status).toBe(403);

    const ok = await t.call(OWNER, "POST", "/meta/entities", { id: "NEW", name: "New Unit", description: "Unit baru", color: "sky" });
    expect(ok.status).toBe(201);

    const meta = await json(await t.call("a@x.id", "GET", "/meta"));
    const created = meta.entities?.find((e: J) => e.id === "NEW");
    expect(created).toBeDefined();
    expect(created.name).toBe("New Unit");

    // Patch entity
    const patchRes = await t.call(OWNER, "PATCH", "/meta/entities/NEW", { name: "New Unit Renamed" });
    expect(patchRes.status).toBe(200);

    // Delete entity
    const delRes = await t.call(OWNER, "DELETE", "/meta/entities/NEW");
    expect(delRes.status).toBe(200);
  });

  it("Superadmin chat privacy: only sees groups and DMs with their account, not general, projects, or others' chats", async () => {
    // 1. Group created by a@x.id with b@x.id (OWNER not included)
    const grpRes = await t.call("a@x.id", "POST", "/chat/groups", { name: "Rahasia Tim", emails: ["b@x.id"] });
    expect(grpRes.status).toBe(201);
    const grpChanId = (await json(grpRes)).id as string;

    // 2. DM between a@x.id and b@x.id
    const dmRes = await t.call("a@x.id", "POST", "/chat/dm", { targetEmail: "b@x.id" });
    expect(dmRes.status).toBe(200);
    const dmChanId = (await json(dmRes)).channelId as string;

    // Send messages in both
    await t.call("a@x.id", "POST", `/chat/channels/${grpChanId}/messages`, { text: "pesan grup", refs: [], attachmentIds: [] });
    await t.call("a@x.id", "POST", `/chat/channels/${dmChanId}/messages`, { text: "pesan dm", refs: [], attachmentIds: [] });

    // Superadmin lists channels
    const ownerChannels = (await json(await t.call(OWNER, "GET", "/chat/channels"))) as unknown as J[];
    const ownerChanIds = ownerChannels.map(c => c.id);

    // Superadmin should NOT see others' group, others' DM, General, or Project channels
    expect(ownerChanIds).not.toContain(grpChanId);
    expect(ownerChanIds).not.toContain(dmChanId);
    expect(ownerChanIds).not.toContain("general");
    expect(ownerChanIds.some(id => id.startsWith("p-"))).toBe(false);

    // Superadmin forbidden from reading or posting in others' chats or General
    expect((await t.call(OWNER, "GET", `/chat/channels/${grpChanId}/messages`)).status).toBe(403);
    expect((await t.call(OWNER, "POST", `/chat/channels/${grpChanId}/messages`, { text: "snoop", refs: [], attachmentIds: [] })).status).toBe(403);
    expect((await t.call(OWNER, "GET", `/chat/channels/${dmChanId}/messages`)).status).toBe(403);
    expect((await t.call(OWNER, "POST", `/chat/channels/${dmChanId}/messages`, { text: "snoop", refs: [], attachmentIds: [] })).status).toBe(403);
    expect((await t.call(OWNER, "GET", `/chat/channels/general/messages`)).status).toBe(403);

    // 3. Superadmin is invited to a group by a@x.id
    const inviteRes = await t.call("a@x.id", "POST", "/chat/groups", { name: "Grup Bersama Superadmin", emails: [OWNER] });
    expect(inviteRes.status).toBe(201);
    const sharedGrpId = (await json(inviteRes)).id as string;

    // 4. DM with Superadmin
    const ownerDmRes = await t.call("a@x.id", "POST", "/chat/dm", { targetEmail: OWNER });
    expect(ownerDmRes.status).toBe(200);
    const ownerDmId = (await json(ownerDmRes)).channelId as string;
    await t.call("a@x.id", "POST", `/chat/channels/${ownerDmId}/messages`, { text: "halo superadmin", refs: [], attachmentIds: [] });

    // Superadmin lists channels again
    const updatedOwnerChannels = (await json(await t.call(OWNER, "GET", "/chat/channels"))) as unknown as J[];
    const updatedOwnerChanIds = updatedOwnerChannels.map(c => c.id);

    // Superadmin CAN see the group they are in and their DM
    expect(updatedOwnerChanIds).toContain(sharedGrpId);
    expect(updatedOwnerChanIds).toContain(ownerDmId);

    // Superadmin CAN read and send messages in their group and DM
    expect((await t.call(OWNER, "GET", `/chat/channels/${sharedGrpId}/messages`)).status).toBe(200);
    const postGrp = await t.call(OWNER, "POST", `/chat/channels/${sharedGrpId}/messages`, { text: "halo semua", refs: [], attachmentIds: [] });
    expect(postGrp.status).toBe(201);

    expect((await t.call(OWNER, "GET", `/chat/channels/${ownerDmId}/messages`)).status).toBe(200);
    const postDm = await t.call(OWNER, "POST", `/chat/channels/${ownerDmId}/messages`, { text: "halo a", refs: [], attachmentIds: [] });
    expect(postDm.status).toBe(201);
  });
});

