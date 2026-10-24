const PERIODS = new Set(["month", "year"]);
const API_BASE = "https://www.aisweicloud.com";

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected request parameters");
  }
}

function assertKeys(value, allowed) {
  assertObject(value);
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError("Unexpected request parameter");
  }
}

function requiredString(value, key, max = 128) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw new TypeError(`Invalid ${key}`);
  }
  return value;
}

function dateString(value, key, pattern) {
  const text = requiredString(value, key, 10);
  if (!pattern.test(text)) throw new TypeError(`Invalid ${key}`);
  return text;
}

function normalizeReadOnlyRequest(name, params = {}) {
  switch (name) {
    case "dashboard":
      assertKeys(params, ["today"]);
      return { path: "/api/plant/dashboard", query: { today: dateString(params.today, "today", /^\d{4}-\d{2}-\d{2}$/) } };
    case "plants":
    case "inverterGroups": {
      assertKeys(params, ["current", "pageSize", "plantId", "level"]);
      if (!Number.isInteger(params.current) || params.current < 1 || params.current > 10000) throw new TypeError("Invalid current");
      if (!Number.isInteger(params.pageSize) || params.pageSize < 1 || params.pageSize > 100) throw new TypeError("Invalid pageSize");
      const query = { current: params.current, pageSize: params.pageSize };
      if (params.plantId !== undefined) {
        if (!(typeof params.plantId === "string" && params.plantId.length <= 128) && !(Number.isInteger(params.plantId) && params.plantId >= 0)) throw new TypeError("Invalid plantId");
        query.plantId = params.plantId;
      }
      if (params.level !== undefined) query.level = requiredString(params.level, "level", 64);
      return { path: "/api/plant/invList", query };
    }
    case "plantCards": {
      assertKeys(params, ["own", "type", "name", "state"]);
      const own = params.own === undefined ? 1 : params.own;
      const type = params.type === undefined ? 1 : params.type;
      if (!Number.isInteger(own) || own < 1 || own > 4) throw new TypeError("Invalid own");
      if (!Number.isInteger(type) || type < 1 || type > 3) throw new TypeError("Invalid type");
      const query = { own, type };
      if (params.name !== undefined) query.name = requiredString(params.name, "name", 128);
      if (params.state !== undefined) query.state = requiredString(params.state, "state", 64);
      return { path: "/api/plant/plantList", query };
    }
    case "plantDetail": {
      assertKeys(params, ["id"]);
      const id = params.id;
      if (!(typeof id === "string" && id.length > 0 && id.length <= 128) && !(Number.isSafeInteger(id) && id >= 0)) throw new TypeError("Invalid id");
      return { path: "/api/plant/detail/international", query: { id } };
    }
    case "plantFlow": {
      assertKeys(params, ["plantId"]);
      const id = params.plantId;
      if (!(typeof id === "string" && id.length > 0 && id.length <= 128) && !(Number.isSafeInteger(id) && id >= 0)) throw new TypeError("Invalid plantId");
      return { path: "/api/plant/plantDetailFlow", query: { plantId: id } };
    }
    case "inverter":
      assertKeys(params, ["isno"]);
      return { path: "/api/inverter/findOneByisno", query: { isno: requiredString(params.isno, "isno") } };
    case "warranty":
      assertKeys(params, ["isno"]);
      return { path: "/api/service/fault/getCsWarrantyInfoes", query: { isno: requiredString(params.isno, "isno") } };
    case "inverterStorage": {
      assertKeys(params, ["isno", "id"]);
      const id = params.id;
      if (!(typeof id === "string" && id.length > 0 && id.length <= 128) && !(Number.isSafeInteger(id) && id >= 0)) throw new TypeError("Invalid id");
      return { path: "/api/plant/storage/detail/v2", query: { isno: requiredString(params.isno, "isno"), id } };
    }
    case "inverterEquipment":
      assertKeys(params, ["isno"]);
      return { path: "/api/equip/invdetail/v2", query: { isno: requiredString(params.isno, "isno") } };
    case "inverterEnergy":
      assertKeys(params, ["isno", "plantId", "date"]);
      return {
        path: "/api/chart/inverter/production/international/totalEnergy",
        query: {
          isno: requiredString(params.isno, "isno"),
          plantId: requiredString(String(params.plantId ?? ""), "plantId"),
          date: dateString(params.date, "date", /^\d{4}-\d{2}-\d{2}$/),
        },
      };
    case "inverterHistory": {
      assertKeys(params, ["isno", "id", "date"]);
      const id = params.id;
      if (!(typeof id === "string" && id.length > 0 && id.length <= 128) && !(Number.isSafeInteger(id) && id >= 0)) throw new TypeError("Invalid id");
      const timestamp = typeof params.date === "string" && /^\d{1,16}$/.test(params.date)
        ? Number(params.date)
        : params.date;
      if (!Number.isSafeInteger(timestamp) || timestamp < 1 || timestamp > 8640000000000000) throw new TypeError("Invalid date");
      return { path: "/api/chart/hyperbola", query: { isno: requiredString(params.isno, "isno"), id, date: timestamp } };
    }
    case "productionMonth":
    case "productionYear": {
      assertKeys(params, ["form", "dateStr"]);
      if (params.form !== 1 && params.form !== 2) throw new TypeError("Invalid form");
      const isMonth = name === "productionMonth";
      const dateStr = dateString(params.dateStr, "dateStr", isMonth ? /^\d{4}-\d{2}$/ : /^\d{4}$/);
      return { path: `/api/chart/user/production/${isMonth ? "month" : "year"}`, query: { form: params.form, dateStr } };
    }
    case "productionTotal": {
      assertKeys(params, ["form"]);
      if (params.form !== 1 && params.form !== 2) throw new TypeError("Invalid form");
      return { path: "/api/chart/user/production/total", query: { form: params.form, dateStr: "" } };
    }
    case "inverterProduction": {
      assertKeys(params, ["isno", "plantId", "period", "date"]);
      const period = requiredString(params.period, "period", 8);
      if (!["daily", "month", "year", "total"].includes(period)) throw new TypeError("Invalid period");
      const date = period === "total" ? "" : requiredString(params.date ?? "", "date", 10);
      if (period === "daily" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError("Invalid date");
      if (period === "month" && !/^\d{4}-\d{2}$/.test(date)) throw new TypeError("Invalid date");
      if (period === "year" && !/^\d{4}$/.test(date)) throw new TypeError("Invalid date");
      return {
        path: `/api/chart/inverter/production/international/v3/${period}`,
        query: {
          isno: requiredString(params.isno, "isno"),
          plantId: requiredString(String(params.plantId ?? ""), "plantId"),
          date,
        },
      };
    }
    case "faults": {
      assertKeys(params, ["id", "scope", "start", "end", "level", "sort"]);
      const scope = requiredString(params.scope, "scope", 8);
      if (scope !== "current" && scope !== "history") throw new TypeError("Invalid scope");
      const id = params.id;
      if (!(typeof id === "string" && id.length > 0 && id.length <= 128) && !(Number.isSafeInteger(id) && id >= 0)) throw new TypeError("Invalid id");
      const start = Number(params.start), end = Number(params.end);
      if (!Number.isSafeInteger(start) || start < 0 || start > 8640000000000000) throw new TypeError("Invalid start");
      if (!Number.isSafeInteger(end) || end < 0 || end > 8640000000000000) throw new TypeError("Invalid end");
      const level = params.level;
      if (level !== 1 && level !== 2 && level !== 3) throw new TypeError("Invalid level");
      const sort = params.sort === undefined ? 2 : params.sort;
      if (sort !== 1 && sort !== 2) throw new TypeError("Invalid sort");
      return { path: `/api/plant/errlist/${scope}/v3`, query: { id, start, end, sort, level } };
    }
    case "comparisonMonth":
    case "comparisonYear": {
      assertKeys(params, ["nowDate", "lastDate"]);
      const isMonth = name === "comparisonMonth";
      const pattern = isMonth ? /^\d{4}-\d{2}$/ : /^\d{4}$/;
      return {
        path: `/api/chart/user/comparison/${isMonth ? "month" : "year"}`,
        query: { nowDate: dateString(params.nowDate, "nowDate", pattern), lastDate: dateString(params.lastDate, "lastDate", pattern) },
      };
    }
    default:
      throw new TypeError("Unsupported read-only request");
  }
}

function makeApiUrl(name, params) {
  const request = normalizeReadOnlyRequest(name, params);
  const url = new URL(request.path, API_BASE);
  for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, String(value));
  return url;
}

module.exports = { API_BASE, normalizeReadOnlyRequest, makeApiUrl };
