const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApiUrl, normalizeReadOnlyRequest } = require("./api.cjs");

test("maps only the observed read-only request names to fixed API routes", () => {
  const url = makeApiUrl("productionMonth", { form: 1, dateStr: "2026-10" });
  assert.equal(url.origin, "https://www.aisweicloud.com");
  assert.equal(url.pathname, "/api/chart/user/production/month");
  assert.deepEqual(Object.fromEntries(url.searchParams), { form: "1", dateStr: "2026-10" });
});

test("maps the paged inverter-group list and comparison parameter shapes", () => {
  assert.deepEqual(normalizeReadOnlyRequest("plants", { current: 1, pageSize: 100, plantId: "P-1", level: "2" }), {
    path: "/api/plant/invList", query: { current: 1, pageSize: 100, plantId: "P-1", level: "2" },
  });
  assert.deepEqual(normalizeReadOnlyRequest("inverterGroups", { current: 1, pageSize: 100 }), {
    path: "/api/plant/invList", query: { current: 1, pageSize: 100 },
  });
  const url = makeApiUrl("comparisonYear", { nowDate: "2026", lastDate: "2025" });
  assert.deepEqual(Object.fromEntries(url.searchParams), { nowDate: "2026", lastDate: "2025" });
});

test("keeps plant cards and paged inverter groups on their verified routes", () => {
  const cardsDefault = makeApiUrl("plantCards");
  assert.equal(cardsDefault.pathname, "/api/plant/plantList");
  assert.deepEqual(Object.fromEntries(cardsDefault.searchParams), { own: "1", type: "1" });
  const cardsFiltered = makeApiUrl("plantCards", { own: 4, type: 3, name: "屋顶", state: "online" });
  assert.equal(cardsFiltered.pathname, "/api/plant/plantList");
  assert.deepEqual(Object.fromEntries(cardsFiltered.searchParams), { own: "4", type: "3", name: "屋顶", state: "online" });
  const detail = makeApiUrl("plantDetail", { id: 900001 });
  assert.equal(detail.pathname, "/api/plant/detail/international");
  assert.deepEqual(Object.fromEntries(detail.searchParams), { id: "900001" });
  const inverterGroups = makeApiUrl("inverterGroups", { current: 2, pageSize: 20, plantId: 900001, level: "1" });
  assert.equal(inverterGroups.pathname, "/api/plant/invList");
  assert.deepEqual(Object.fromEntries(inverterGroups.searchParams), { current: "2", pageSize: "20", plantId: "900001", level: "1" });
  assert.throws(() => makeApiUrl("plantCards", { own: 5 }), /Invalid own/);
  assert.throws(() => makeApiUrl("plantCards", { type: 4 }), /Invalid type/);
});

test("maps verified inverter detail and energy queries to fixed read-only routes", () => {
  const storage = makeApiUrl("inverterStorage", { isno: "INV-1", id: "PL-9" });
  assert.equal(storage.pathname, "/api/plant/storage/detail/v2");
  assert.deepEqual(Object.fromEntries(storage.searchParams), { isno: "INV-1", id: "PL-9" });
  const equipment = makeApiUrl("inverterEquipment", { isno: "INV-1" });
  assert.equal(equipment.pathname, "/api/equip/invdetail/v2");
  const energy = makeApiUrl("inverterEnergy", { isno: "INV-1", plantId: "PL-9", date: "2026-10-24" });
  assert.equal(energy.pathname, "/api/chart/inverter/production/international/totalEnergy");
  assert.deepEqual(Object.fromEntries(energy.searchParams), { isno: "INV-1", plantId: "PL-9", date: "2026-10-24" });
  const history = makeApiUrl("inverterHistory", { isno: "INV-1", id: "PL-9", date: 1792800000000 });
  assert.equal(history.pathname, "/api/chart/hyperbola");
  assert.deepEqual(Object.fromEntries(history.searchParams), { isno: "INV-1", id: "PL-9", date: "1792800000000" });
});

test("rejects unknown endpoints, extra parameters, malformed dates, and write-like payloads", () => {
  assert.throws(() => makeApiUrl("/api/delete", {}), /Unsupported/);
  assert.throws(() => makeApiUrl("dashboard", { today: "2026-10-24", method: "DELETE" }), /Unexpected/);
  assert.throws(() => makeApiUrl("dashboard", { today: "yesterday" }), /Invalid today/);
  assert.throws(() => makeApiUrl("plants", { current: 1, pageSize: 100, isDelete: true }), /Unexpected/);
  assert.throws(() => makeApiUrl("inverterEnergy", { isno: "x", plantId: "y", date: "today" }), /Invalid date/);
  assert.throws(() => makeApiUrl("inverterHistory", { isno: "x", id: "y", date: "bad" }), /Invalid date/);
});

test("warranty lookup is fixed to the observed read-only serial query", () => {
  const url = makeApiUrl("warranty", { isno: "DEMO-INVERTER-1" });
  assert.equal(url.pathname, "/api/service/fault/getCsWarrantyInfoes");
  assert.deepEqual(Object.fromEntries(url.searchParams), { isno: "DEMO-INVERTER-1" });
  assert.throws(() => makeApiUrl("warranty", { isno: "" }), /Invalid isno/);
  assert.throws(() => makeApiUrl("warranty", { isno: "DEMO-1", method: "POST" }), /Unexpected/);
});

test("maps the account lifetime trend and per-inverter production bars", () => {
  const total = makeApiUrl("productionTotal", { form: 2 });
  assert.equal(total.pathname, "/api/chart/user/production/total");
  assert.deepEqual(Object.fromEntries(total.searchParams), { form: "2", dateStr: "" });

  const month = makeApiUrl("inverterProduction", { isno: "INV-1", plantId: 900001, period: "month", date: "2026-10" });
  assert.equal(month.pathname, "/api/chart/inverter/production/international/v3/month");
  assert.deepEqual(Object.fromEntries(month.searchParams), { isno: "INV-1", plantId: "900001", date: "2026-10" });

  const year = makeApiUrl("inverterProduction", { isno: "INV-1", plantId: "900001", period: "year", date: "2026" });
  assert.deepEqual(Object.fromEntries(year.searchParams), { isno: "INV-1", plantId: "900001", date: "2026" });
});

test("rejects invalid trend parameters and unsupported production periods", () => {
  assert.throws(() => makeApiUrl("productionTotal", { form: 3 }), /Invalid form/);
  assert.throws(() => makeApiUrl("inverterProduction", { isno: "x", plantId: "p", period: "weekly", date: "2026" }), /Invalid period/);
  assert.throws(() => makeApiUrl("inverterProduction", { isno: "x", plantId: "p", period: "month", date: "2026" }), /Invalid date/);
  assert.throws(() => makeApiUrl("inverterProduction", { isno: "x", plantId: "p", period: "daily", date: "2026-10" }), /Invalid date/);
  assert.throws(() => makeApiUrl("inverterProduction", { isno: "x", plantId: "p", period: "year", date: "2026", extra: 1 }), /Unexpected/);
});

test("maps plant fault history with a fixed scope, range, level, and sort", () => {
  const url = makeApiUrl("faults", { id: "P-1", scope: "history", start: 0, end: 1792800000000, level: 3 });
  assert.equal(url.pathname, "/api/plant/errlist/history/v3");
  assert.deepEqual(Object.fromEntries(url.searchParams), { id: "P-1", start: "0", end: "1792800000000", sort: "2", level: "3" });
  const active = makeApiUrl("faults", { id: 900001, scope: "current", start: 0, end: 1792800000000, level: 2, sort: 1 });
  assert.equal(active.pathname, "/api/plant/errlist/current/v3");
  assert.equal(active.searchParams.get("sort"), "1");
  assert.throws(() => makeApiUrl("faults", { id: "P-1", scope: "all", start: 0, end: 1, level: 3 }), /Invalid scope/);
  assert.throws(() => makeApiUrl("faults", { id: "P-1", scope: "current", start: -1, end: 1, level: 3 }), /Invalid start/);
  assert.throws(() => makeApiUrl("faults", { id: "P-1", scope: "current", start: 0, end: 1, level: 4 }), /Invalid level/);
  assert.throws(() => makeApiUrl("faults", { id: "P-1", scope: "current", start: 0, end: 1, level: 3, extra: true }), /Unexpected/);
});
