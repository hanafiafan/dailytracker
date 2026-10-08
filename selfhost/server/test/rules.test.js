// Smoke test of the access rules and the HTTP API: `npm test`.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/store.js";
import { makeRules } from "../src/rules.js";

const store = openStore(mkdtempSync(join(tmpdir(), "th-")));
store.set("team/vero@x.id", { name: "Vero", isAdmin: true });                       // admin, all units
store.set("team/hcs@x.id", { name: "Hcs", isAdmin: true, adminGroups: ["HCS"] });   // unit admin
store.set("team/a@x.id", { name: "A", group: "HCS" });
store.set("team/b@x.id", { name: "B", group: "ADS" });
const R = makeRules(store, "owner@x.id");
const as = e => R(e).can;

assert(as("owner@x.id")("create", "team/new@x.id", null, { name: "N" }));            // owner not in team, still boss
assert(as("vero@x.id")("update", "team/b@x.id", { name: "B" }, { name: "B2" }));
assert(as("hcs@x.id")("get", "tasks/a@x.id/items/1"));                               // unit admin sees own unit
assert(!as("hcs@x.id")("get", "tasks/b@x.id/items/1"));                              // ...not other units
assert(!as("hcs@x.id")("update", "team/a@x.id", { name: "A", group: "HCS" }, { name: "A", group: "HCS", isAdmin: true })); // no privilege escalation
assert(as("a@x.id")("get", "tasks/a@x.id/items/1"));
assert(!as("a@x.id")("get", "tasks/b@x.id/items/1"));                                // member sees only self
assert(as("a@x.id")("create", "tasks/a@x.id/items/1", null, { by: "self", title: "t" }));
assert(!as("a@x.id")("create", "tasks/a@x.id/items/2", null, { by: "owner", title: "t" })); // cannot forge admin tasks
assert(as("a@x.id")("create", "tasks/a@x.id/items/r-1-2026", null, { by: "owner", routine: "1" }));
const it = { title: "t", status: "todo", by: "owner" };
assert(as("a@x.id")("update", "tasks/a@x.id/items/1", it, { ...it, status: "done", doneAt: 1 }));
assert(!as("a@x.id")("update", "tasks/a@x.id/items/1", it, { ...it, title: "hacked" }));   // only status/proof fields
assert(!as("a@x.id")("delete", "tasks/a@x.id/items/1", it));                         // only self-made tasks
assert(!as("stranger@x.id")("get", "team/a@x.id"));
assert(!as("a@x.id")("update", "team/a@x.id", { name: "A" }, { name: "A", isAdmin: true })); // no self-promotion

store.set("tasks/z@x.id/items/9", { date: "2026-10-08", title: "x" });
assert.equal(store.list("tasks/z@x.id/items", [["date", ">=", "2026-10-01"]]).length, 1);
assert.equal(store.list("tasks/z@x.id/items", [["date", ">=", "2026-11-01"]]).length, 0);
console.log("rules + store ok");
