import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { plants as samplePlants, summary as sampleSummary } from "./data";
import { inverterPlantRequest, MISSING_PLANT_ID_MESSAGE, withDevicePlantContext } from "./device-context";
import { HistoryChart } from "./HistoryChart";
import { TrendChart } from "./TrendChart";
import "./style.css";

type View = "overview" | "plants" | "devices" | "service" | "alerts";
type Mode = "disconnected" | "live" | "sample";
type Row = Record<string, unknown>;
type ReadResult = { success: boolean; data?: unknown; error?: string };
type Connection = { status: "connected" | "login-window-open" | "disconnected"; error?: string };

declare global {
  interface Window {
    desktop?: {
      connectAccount?: () => Promise<{ success: boolean; connection?: Connection; error?: string }>;
      getConnection?: () => Promise<Connection>;
      disconnectAccount?: () => Promise<{ success: boolean; connection?: Connection; error?: string }>;
      requestReadOnly?: (name: string, params?: Row) => Promise<ReadResult>;
      exportReport?: (records: Row[]) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      onNavigate?: (callback: (view: View) => void) => () => void;
      onLogout?: (callback: () => void) => () => void;
    };
  }
}

const routes: { id: View; label: string; glyph: string }[] = [
  { id: "overview", label: "总览", glyph: "◫" },
  { id: "plants", label: "电站", glyph: "⌂" },
  { id: "devices", label: "设备", glyph: "▦" },
  { id: "service", label: "服务", glyph: "◇" },
  { id: "alerts", label: "告警", glyph: "⚠" },
];

const labels: Record<string, string> = {
  plantName: "电站名称", plantname: "电站名称", name: "名称", byname: "设备名称",
  plantId: "电站编号", plantid: "电站编号", id: "编号", location: "位置", address: "地址",
  capacity: "装机容量", installedCapacity: "装机容量", today: "今日发电", e_today: "今日发电",
  total: "累计发电", totalEnergy: "累计发电", power: "当前功率", pac: "当前功率",
  status: "状态", type: "类型", plantType: "电站类型", revenue: "收益", co2: "碳减排",
  errCode: "故障代码", context: "描述", occdtTime: "发生时间", level: "级别",
  startdt: "并网日期", createdt: "建档时间", ePower: "当前功率(W)", savings: "收益", buyxs: "购电价", gainxs: "上网电价",
  grid: "电网功率", load: "负载功率", battery: "电池功率", soc: "电池 SOC", generator: "发电机功率", lastUpdateTime: "数据时间",
  isno: "设备序列号", psno: "采集器序列号", hostType: "设备类型", devtypename: "型号", softver: "固件版本", ludt: "更新时间", pac_u: "功率单位", etotal_u: "累计电量单位", e_todayUnit: "发电量单位",
  voltage: "电压", current: "电流", mppt: "MPPT", pv: "直流", ac: "交流", dc: "直流", hotal: "累计运行时间", monthincome: "本月收益", todayincome: "今日收益", totalincome: "累计收益",
  month: "本月发电", statistics: "统计", online: "在线", offline: "离线", fault: "故障", warning: "警告",
};

const fmt = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isFinite(value) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value) : "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === "object") return "详情";
  return String(value);
};

function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function unwrap(result: ReadResult | unknown): unknown {
  if (result && typeof result === "object" && "success" in result) {
    const wrapped = result as ReadResult;
    if (!wrapped.success) throw new Error(wrapped.error || "读取失败");
    result = wrapped.data;
  }
  if (result && typeof result === "object" && "code" in result && "result" in result) {
    const envelope = result as { code: number | string; result: unknown; message?: string };
    if (String(envelope.code) !== "0" && String(envelope.code) !== "200" && String(envelope.code) !== "success") {
      throw new Error(envelope.message || `服务返回错误（${envelope.code}）`);
    }
    return envelope.result;
  }
  return result;
}

function asObject(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function recordsFrom(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter((item): item is Row => !!asObject(item));
  const object = asObject(value);
  if (!object) return [];
  for (const key of ["records", "list", "rows", "data", "plants", "deviceList", "inverterList"]) {
    if (Array.isArray(object[key])) return (object[key] as unknown[]).filter((item): item is Row => !!asObject(item));
  }
  return [];
}

function flattenDeviceGroups(groups: Row[], plant?: Row): Row[] {
  return groups.flatMap((group) => {
    const list = Array.isArray(group.invList) ? group.invList : [];
    return list.filter((device): device is Row => !!asObject(device)).map((device) => withDevicePlantContext({
      ...device,
      psno: getValue(device, ["psno"]) ?? group.psno,
    }, group, plant));
  });
}

function deviceSourceFields(device: Row | null): Row {
  if (!device) return {};
  return Object.fromEntries(Object.entries(device).filter(([key]) => key !== "deviceGroup"));
}

function getValue(row: Row, keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  return undefined;
}

function getId(row: Row): string {
  return String(getValue(row, ["stationid", "plantId", "plantid", "id", "psId", "psid"]) ?? "");
}

function getName(row: Row): string {
  return String(getValue(row, ["stationname", "plantName", "plantname", "byname", "name"]) ?? "未命名电站");
}

function displayName(key: string): string {
  return labels[key] || labels[key.toLowerCase()] || key;
}

function statusLabel(value: unknown): string {
  if (String(value) === "1") return "在线";
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) return `状态 ${String(value)}`;
  return fmt(value);
}

function metricWithUnit(value: unknown, unit: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return `${fmt(value)}${unit ? ` ${fmt(unit)}` : ""}`;
}

function DataRows({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const object = asObject(value);
  if (!object) {
    if (Array.isArray(value)) return <div className="nested-list">{value.map((item, i) => <DataRows key={i} value={item} depth={depth + 1} />)}</div>;
    return <span className="data-value">{fmt(value)}</span>;
  }
  const entries = Object.entries(object).filter(([, v]) => v !== undefined && v !== null && typeof v !== "function");
  if (!entries.length) return <span className="muted">暂无可显示字段</span>;
  return <div className={`data-rows depth-${Math.min(depth, 2)}`}>
    {entries.map(([key, item]) => {
      const nested = asObject(item) || Array.isArray(item);
      return <div className={nested ? "data-entry nested" : "data-entry"} key={key}>
        <span className="data-key">{displayName(key)}</span>
        <span className="data-value">{nested ? <DataRows value={item} depth={depth + 1} /> : fmt(item)}</span>
      </div>;
    })}
  </div>;
}

function formatTimestamp(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  return Number.isNaN(date.getTime()) ? fmt(value) : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function levelLabel(value: unknown): string {
  const level = Number(value);
  return level === 3 ? "故障" : level === 2 ? "告警" : level === 1 ? "提示" : "记录";
}

function Fact({ label, value, hint }: { label: string; value: unknown; hint?: string }) {
  return <div className="fact"><small>{label}</small><b>{fmt(value)}</b>{hint && <em>{hint}</em>}</div>;
}

function FlowStat({ label, value, unit, accent = "" }: { label: string; value: unknown; unit: unknown; accent?: string }) {
  return <div className={`flow-stat ${accent}`}><small>{label}</small><b>{fmt(value)}<em>{unit ? String(unit) : ""}</em></b></div>;
}

function Metric({ label, value, unit, accent = "", hint }: { label: string; value: unknown; unit?: unknown; accent?: string; hint?: string }) {
  return <article className="metric-card">
    <div className="metric-label"><span className={`metric-mark ${accent}`} />{label}</div>
    <strong>{fmt(value)}<small>{unit ? ` ${fmt(unit)}` : ""}</small></strong>
    {hint && <p className="metric-hint">{hint}</p>}
  </article>;
}

function App() {
  const [mode, setMode] = useState<Mode>("disconnected");
  const [connection, setConnection] = useState<Connection>({ status: "disconnected" });
  const [view, setView] = useState<View>("overview");
  const [rows, setRows] = useState<Row[]>([]);
  const [dashboard, setDashboard] = useState<Row | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<Row | null>(null);
  const [plantDetail, setPlantDetail] = useState<Row | null>(null);
  const [inverter, setInverter] = useState<Row | null>(null);
  const [devices, setDevices] = useState<Row[]>([]);
  const [deviceReadError, setDeviceReadError] = useState("");
  const [query, setQuery] = useState("");
  const [deviceRow, setDeviceRow] = useState<Row | null>(null);
  const [inverterStorage, setInverterStorage] = useState<Row | null>(null);
  const [inverterEquipment, setInverterEquipment] = useState<Row | null>(null);
  const [inverterEnergy, setInverterEnergy] = useState<Row | null>(null);
  const [historyData, setHistoryData] = useState<Row | null>(null);
  const [historyMetric, setHistoryMetric] = useState("vpv");
  const [historyDate, setHistoryDate] = useState(() => localDateString());
  const [historyPage, setHistoryPage] = useState(0);
  const [trendPeriod, setTrendPeriod] = useState<"month" | "year" | "total">("month");
  const [trendForm, setTrendForm] = useState<1 | 2>(1);
  const [trend, setTrend] = useState<Row | null>(null);
  const [trendBusy, setTrendBusy] = useState(false);
  const [deviceTrendPeriod, setDeviceTrendPeriod] = useState<"month" | "year">("month");
  const [deviceTrend, setDeviceTrend] = useState<Row | null>(null);
  const [deviceTrendBusy, setDeviceTrendBusy] = useState(false);
  const [plantFlow, setPlantFlow] = useState<Row | null>(null);
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<Row[]>([]);
  const [alertLevel, setAlertLevel] = useState<"all" | 2 | 3>("all");
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsError, setAlertsError] = useState("");
  const [warrantySerial, setWarrantySerial] = useState("");
  const [warrantyData, setWarrantyData] = useState<Row | null>(null);
  const [warrantyBusy, setWarrantyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const selectionId = useRef(0);

  const read = useCallback(async (name: string, params: Row = {}) => {
    if (!window.desktop?.requestReadOnly) throw new Error("当前窗口没有可用的只读数据连接。");
    return unwrap(await window.desktop.requestReadOnly(name, params));
  }, []);

  const refresh = useCallback(async () => {
    if (mode === "sample") return;
    setBusy(true); setError(""); setNotice("");
    try {
      const today = localDateString();
      const [plantResult, dashResult] = await Promise.allSettled([
        read("plantCards", { own: 1, type: 1 }),
        read("dashboard", { today }),
      ]);
      if (plantResult.status === "fulfilled") {
        setRows(recordsFrom(plantResult.value));
      } else {
        throw plantResult.reason;
      }
      const plantRows = recordsFrom(plantResult.value);
      setDevices([]); setDeviceReadError("");
      const groupResults = await Promise.allSettled(plantRows.map(async (plant) => {
        const plantId = getId(plant);
        if (!plantId) throw new Error("电站记录缺少编号");
        return { plant, payload: await read("inverterGroups", { current: 1, pageSize: 100, plantId }) };
      }));
      const deviceRows: Row[] = [];
      let failedGroups = 0;
      for (const result of groupResults) {
        if (result.status === "fulfilled") deviceRows.push(...flattenDeviceGroups(recordsFrom(result.value.payload), result.value.plant));
        else failedGroups += 1;
      }
      setDevices(deviceRows);
      if (failedGroups) setDeviceReadError(`有 ${failedGroups} 个电站的设备组读取失败；请刷新重试。`);
      else if (!plantRows.length) setDeviceReadError("账户当前没有可读取的电站设备组。");
      if (dashResult.status === "fulfilled") setDashboard(asObject(dashResult.value));
      else setDashboard(null);
      setNotice(dashResult.status === "rejected" ? "电站列表已更新；总览统计暂不可用。" : "数据已更新");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取爱士惟账户数据失败。");
    } finally { setBusy(false); }
  }, [mode, read]);

  const checkConnection = useCallback(async () => {
    if (!window.desktop?.getConnection) return;
    try {
      const next = await window.desktop.getConnection();
      setConnection(next);
      if (next.status === "connected" && mode === "disconnected") {
        setMode("live");
        setTimeout(() => void refresh(), 0);
      }
      if (next.status === "disconnected" && mode === "live") {
        setMode("disconnected"); setRows([]); setDashboard(null); setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setDevices([]); setInverter(null); setTrend(null); setDeviceTrend(null);
      }
    } catch { /* The visible connection state remains unchanged if the native bridge is unavailable. */ }
  }, [mode, refresh]);

  useEffect(() => {
    void checkConnection();
    const timer = window.setInterval(() => void checkConnection(), connection.status === "login-window-open" ? 1200 : 5000);
    const stopNavigate = window.desktop?.onNavigate?.((next) => { setView(next); if (next === "service") { setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setInverter(null); } location.hash = `#${next}`; });
    const stopLogout = window.desktop?.onLogout?.(() => { setMode("disconnected"); setConnection({ status: "disconnected" }); setRows([]); setDashboard(null); setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setDevices([]); setInverter(null); setError(""); });
    const onHash = () => { const candidate = location.hash.slice(1); if (routes.some((item) => item.id === candidate)) setView(candidate as View); };
    addEventListener("hashchange", onHash);
    return () => { clearInterval(timer); stopNavigate?.(); stopLogout?.(); removeEventListener("hashchange", onHash); };
  }, [checkConnection, connection.status]);

  useEffect(() => { if (mode === "live") void refresh(); }, [mode]);

  useEffect(() => {
    if (mode === "live" && !selectedPlant) void loadTrend();
  }, [mode, trendPeriod, trendForm, dashboard, selectedPlant]);

  useEffect(() => {
    if (mode === "live" && deviceRow) void loadDeviceTrend();
  }, [mode, deviceTrendPeriod, deviceRow]);

  useEffect(() => {
    if (mode === "live" && view === "alerts" && rows.length) void loadAlerts();
  }, [mode, view, rows]);

  const visibleRows = useMemo(() => rows.filter((row) => Object.values(row).some((value) => fmt(value).toLowerCase().includes(query.toLowerCase()))), [rows, query]);

  async function connect() {
    setError(""); setNotice("");
    if (!window.desktop?.connectAccount) { setError("请在 macOS 客户端中连接爱士惟账户。"); return; }
    try {
      const result = await window.desktop.connectAccount();
      if (!result.success) throw new Error(result.error || "无法打开账户登录窗口");
      if (result.connection) setConnection(result.connection);
      setNotice("请在爱士惟登录窗口完成登录，然后返回此处加载账户数据。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "打开账户登录窗口失败。"); }
  }

  function enterSample() {
    const sampleRows: Row[] = samplePlants.map((plant) => ({ ...plant, plantName: plant.name, plantId: plant.id, todayUnit: "kWh", totalUnit: "kWh", capacityUnit: "kWp" }));
    setMode("sample"); setRows(sampleRows); setDashboard({ today: sampleSummary.today, month: sampleSummary.month, total: sampleSummary.total, co2: sampleSummary.co2, sample: true });
    setConnection({ status: "disconnected" }); setError(""); setNotice(""); setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setDevices([]); setInverter(null); setTrend(null); setDeviceTrend(null); setView("overview");
  }

  async function leaveSample() {
    setMode("disconnected"); setRows([]); setDashboard(null); setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setDevices([]); setInverter(null); setTrend(null); setDeviceTrend(null); await checkConnection();
  }

  async function openPlant(row: Row) {
    const requestId = ++selectionId.current;
    setSelectedPlant(row); setPlantDetail(null); setPlantFlow(null); setDevices([]); setDeviceReadError(""); setInverter(null); setError("");
    setView("plants"); location.hash = "#plants";
    if (mode === "sample") { setPlantDetail(row); setDevices([]); setView("plants"); return; }
    const id = getId(row);
    if (!id) { setError("这条电站记录没有可用于查询详情的编号。"); return; }
    setBusy(true);
    try {
      const [detailResult, groupResult, flowResult] = await Promise.allSettled([
        read("plantDetail", { id }),
        read("inverterGroups", { current: 1, pageSize: 100, plantId: id }),
        read("plantFlow", { plantId: id }),
      ]);
      if (requestId !== selectionId.current) return;
      const detail = detailResult.status === "fulfilled" ? asObject(detailResult.value) : null;
      setPlantDetail(detail || row);
      setPlantFlow(flowResult.status === "fulfilled" ? asObject(flowResult.value) : null);
      const groupRows = groupResult.status === "fulfilled" ? recordsFrom(groupResult.value) : [];
      const deviceRows = groupResult.status === "fulfilled" ? flattenDeviceGroups(groupRows, row) : recordsFrom(detail);
      setDevices(deviceRows);
      setDeviceReadError(groupResult.status === "rejected" ? "读取该电站的设备组失败；请刷新重试。" : "");
      if (detailResult.status === "rejected") setError("暂时无法读取该电站详情；已保留列表记录供查看。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "读取电站详情失败。"); }
    finally { if (requestId === selectionId.current) setBusy(false); }
  }

  async function openInverter(device: Row) {
    const requestId = ++selectionId.current;
    const plantRequest = inverterPlantRequest(device, selectedPlant);
    const matchingPlant = plantRequest.id ? rows.find((row) => getId(row) === plantRequest.id) : undefined;
    const previousPlantId = selectedPlant ? getId(selectedPlant) : "";
    const plantChanged = !selectedPlant || previousPlantId !== (plantRequest.id || "");
    const needsPlantLoad = plantChanged || !plantDetail;
    const group = asObject(device.deviceGroup) || {};
    const targetPlant: Row = matchingPlant || (selectedPlant && !plantChanged ? selectedPlant : {
      ...(plantRequest.id ? { stationid: plantRequest.id } : {}),
      stationname: String(getValue(group, ["stationname", "name"]) ?? getValue(device, ["byname", "name"]) ?? "设备详情"),
    });
    setSelectedPlant(targetPlant);
    setPlantDetail(needsPlantLoad ? targetPlant : plantDetail);
    if (plantChanged) { setDevices([]); setDeviceReadError(""); }
    setDeviceRow(device); setInverter(device); setInverterStorage(null); setInverterEquipment(null); setInverterEnergy(null); setHistoryData(null); setHistoryMetric("vpv"); setDeviceTrend(null); setDeviceTrendPeriod("month"); setError("");
    setView("plants"); location.hash = "#plants";
    if (mode === "sample") return;
    const serial = String(getValue(device, ["isno", "sn", "serialNo"]) ?? "");
    if (!serial) { setError("该设备没有可用于查询详情的序列号。"); return; }
    setBusy(true);
    try {
      const [baseResult, storageResult, equipmentResult] = await Promise.allSettled([
        read("inverter", { isno: serial }),
        plantRequest.id
          ? read("inverterStorage", { isno: serial, id: plantRequest.id })
          : Promise.reject(new Error(plantRequest.error)),
        read("inverterEquipment", { isno: serial }),
      ]);
      let plantDetailResult: PromiseSettledResult<unknown> | undefined;
      let plantGroupsResult: PromiseSettledResult<unknown> | undefined;
      if (needsPlantLoad && plantRequest.id) {
        [plantDetailResult, plantGroupsResult] = await Promise.allSettled([
          read("plantDetail", { id: plantRequest.id }),
          read("inverterGroups", { current: 1, pageSize: 100, plantId: plantRequest.id }),
        ]);
      }
      if (requestId !== selectionId.current) return;
      const base = baseResult.status === "fulfilled" ? asObject(baseResult.value) : device;
      setInverter(base || device);
      if (storageResult.status === "fulfilled") setInverterStorage(asObject(storageResult.value));
      if (equipmentResult.status === "fulfilled") setInverterEquipment(asObject(equipmentResult.value));
      if (plantDetailResult) {
        if (plantDetailResult.status === "fulfilled") setPlantDetail(asObject(plantDetailResult.value) || targetPlant);
        else setError("逆变器已读取；所属电站详情暂不可用。");
      }
      if (plantGroupsResult) {
        if (plantGroupsResult.status === "fulfilled") {
          setDevices(flattenDeviceGroups(recordsFrom(plantGroupsResult.value), targetPlant));
          setDeviceReadError("");
        } else {
          setDevices([]);
          setDeviceReadError("读取所属电站的设备组失败；请刷新重试。");
        }
      }
      if (plantRequest.id) {
        try {
          const energy = asObject(await read("inverterEnergy", { isno: serial, plantId: plantRequest.id, date: historyDate }));
          if (requestId === selectionId.current) setInverterEnergy(energy);
        } catch { /* The optional daily energy panel stays empty if this endpoint is unavailable. */ }
      }
      if (baseResult.status === "rejected" && storageResult.status === "rejected" && equipmentResult.status === "rejected") {
        throw storageResult.reason;
      }
      if (!plantRequest.id) setError(plantRequest.error || MISSING_PLANT_ID_MESSAGE);
      if (storageResult.status === "rejected" || equipmentResult.status === "rejected") {
        setError(!plantRequest.id ? plantRequest.error || MISSING_PLANT_ID_MESSAGE : storageResult.status === "rejected"
          ? "逆变器基本信息已读取；直流、交流通道暂不可用，完整接口响应仍可在下方展开查看。"
          : "逆变器基本信息已读取；每日发电统计暂不可用，完整接口响应仍可在下方展开查看。");
      }
    }
    catch (reason) { if (requestId === selectionId.current) setError(reason instanceof Error ? reason.message : "读取逆变器详情失败。"); }
    finally { if (requestId === selectionId.current) setBusy(false); }
  }

  async function loadHistory(metric = historyMetric, date = historyDate) {
    if (!deviceRow || mode === "sample") return;
    const serial = String(getValue(deviceRow, ["isno", "sn", "serialNo"]) ?? "");
    const plantRequest = inverterPlantRequest(deviceRow, selectedPlant);
    if (!serial) { setHistoryData(null); setError("读取历史曲线需要设备序列号。"); return; }
    if (!plantRequest.id) { setHistoryData(null); setError(plantRequest.error || MISSING_PLANT_ID_MESSAGE); return; }
    const requestId = selectionId.current;
    setBusy(true); setError(""); setHistoryPage(0);
    try {
      const timestamp = new Date(`${date}T00:00:00`).getTime();
      const response = asObject(await read("inverterHistory", { isno: serial, id: plantRequest.id, date: timestamp }));
      if (requestId !== selectionId.current) return;
      setHistoryData(response);
      if (!response) setError("该日期没有返回历史曲线数据。");
    } catch (reason) { if (requestId === selectionId.current) { setHistoryData(null); setError(reason instanceof Error ? reason.message : "读取历史曲线失败。"); } }
    finally { if (requestId === selectionId.current) setBusy(false); }
  }

  async function loadTrend(period = trendPeriod, form = trendForm) {
    if (mode !== "live") return;
    setTrendBusy(true);
    try {
      const now = new Date();
      const dateStr = period === "month" ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` : period === "year" ? String(now.getFullYear()) : "";
      const name = period === "month" ? "productionMonth" : period === "year" ? "productionYear" : "productionTotal";
      const payload = period === "total" ? await read(name, { form }) : await read(name, { form, dateStr });
      setTrend(asObject(payload));
    } catch { setTrend(null); }
    finally { setTrendBusy(false); }
  }

  async function loadDeviceTrend(period = deviceTrendPeriod) {
    if (mode !== "live" || !deviceRow) return;
    const serial = String(getValue(deviceRow, ["isno", "sn", "serialNo"]) ?? "");
    const plantRequest = inverterPlantRequest(deviceRow, selectedPlant);
    if (!serial || !plantRequest.id) { setDeviceTrend(null); return; }
    setDeviceTrendBusy(true);
    try {
      const now = new Date();
      const date = period === "month" ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` : String(now.getFullYear());
      setDeviceTrend(asObject(await read("inverterProduction", { isno: serial, plantId: plantRequest.id, period, date })));
    } catch { setDeviceTrend(null); }
    finally { setDeviceTrendBusy(false); }
  }

  async function loadAlerts() {
    if (mode !== "live" || !rows.length) return;
    setAlertsBusy(true); setAlertsError("");
    const now = Date.now();
    try {
      const results = await Promise.allSettled(rows.map(async (plant) => {
        const id = getId(plant);
        if (!id) throw new Error("电站记录缺少编号");
        const [faults, warnings, active] = await Promise.all([
          read("faults", { id, scope: "history", start: 0, end: now, level: 3 }),
          read("faults", { id, scope: "history", start: 0, end: now, level: 2 }),
          read("faults", { id, scope: "current", start: now, end: now, level: 3 }),
        ]);
        const pick = (payload: unknown) => {
          const container = asObject(asObject(payload)?.data) || asObject(payload) || {};
          const list = container.errorList;
          return (Array.isArray(list) ? list : []).filter((item): item is Row => !!asObject(item))
            .map((item) => ({ ...item, plantName: getName(plant), plantId: id }));
        };
        return { history: [...pick(faults), ...pick(warnings)], active: pick(active) };
      }));
      const history: Row[] = [];
      const active: Row[] = [];
      let failed = 0;
      for (const result of results) {
        if (result.status === "fulfilled") { history.push(...result.value.history); active.push(...result.value.active); }
        else failed += 1;
      }
      const seen = new Set<string>();
      const deduped = history.filter((row) => {
        const key = `${String(row.isno)}-${String(row.occdt ?? row.tmstp)}-${String(row.errCode)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => Number(b.occdt ?? b.tmstp ?? 0) - Number(a.occdt ?? a.tmstp ?? 0));
      setAlerts(deduped);
      setActiveAlerts(active);
      if (failed) setAlertsError(`有 ${failed} 个电站的告警记录读取失败。`);
    } catch (reason) {
      setAlertsError(reason instanceof Error ? reason.message : "读取告警记录失败。");
    } finally { setAlertsBusy(false); }
  }

  async function queryWarranty() {
    if (mode !== "live") return;
    const serial = warrantySerial.trim();
    if (!serial) { setError("请输入设备序列号，或先刷新账户设备列表。"); return; }
    setWarrantyBusy(true); setError(""); setWarrantyData(null);
    try {
      const result = asObject(await read("warranty", { isno: serial }));
      setWarrantyData(result);
      if (!result) setNotice("接口没有返回质保记录。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "读取质保信息失败。"); }
    finally { setWarrantyBusy(false); }
  }

  async function disconnect() {
    if (!window.desktop?.disconnectAccount) return;
    setBusy(true); setError("");
    try {
      const result = await window.desktop.disconnectAccount();
      if (!result.success) throw new Error(result.error || "断开账户失败");
      setConnection(result.connection || { status: "disconnected" }); setMode("disconnected"); setRows([]); setDashboard(null); setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setDevices([]); setInverter(null); setTrend(null); setDeviceTrend(null); setNotice("已断开爱士惟账户");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "断开账户失败。"); }
    finally { setBusy(false); }
  }

  async function exportCsv() {
    if (mode === "sample") { setError("离线示例体验不支持导出真实报表。"); return; }
    if (!window.desktop?.exportReport) { setError("当前客户端没有可用的 CSV 导出功能。"); return; }
    setExporting(true); setError(""); setNotice("");
    try {
      const csvRows = rows.map((row) => {
        const withUnit = (valueKeys: string[], unitKeys: string[]) => {
          const value = getValue(row, valueKeys);
          const unit = getValue(row, unitKeys);
          if (value === undefined) return "";
          return `${String(value)}${unit === undefined ? "" : ` ${String(unit)}`}`;
        };
        return {
          id: String(getValue(row, ["stationid", "plantId", "plantid", "id"]) ?? ""),
          name: String(getValue(row, ["stationname", "plantName", "plantname", "name"]) ?? ""),
          location: String(getValue(row, ["location", "address", "plantAddress"]) ?? ""),
          capacity: getValue(row, ["totalpower", "capacity", "installedCapacity", "designCapacity"]) ?? "",
          today: withUnit(["etoday", "today", "e_today"], ["etodayUnit", "todayUnit", "e_todayUnit"]),
          total: withUnit(["etotal", "total", "e_total"], ["etotalUnit", "totalUnit", "e_totalUnit"]),
          status: getValue(row, ["status", "plantStatus"]) ?? "",
          efficiency: "",
          devices: "",
        };
      });
      const result = await window.desktop.exportReport(csvRows);
      if (!result.success) { if (result.error !== "cancelled") throw new Error(result.error || "导出失败"); return; }
      setNotice(result.filePath ? `报表已保存：${result.filePath}` : "报表已导出");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "导出报表失败。"); }
    finally { setExporting(false); }
  }

  const sample = mode === "sample";
  const dashboardData = dashboard || {};
  const statistics = asObject(dashboardData.statistics) || {};
  const powerStats = asObject(dashboardData.pacPercent) || {};
  const income = asObject(dashboardData.incomeMap) || {};
  const social = asObject(dashboardData.socialMap) || {};
  const moneyUnit = String(income.money ?? "￥");
  const deviceDaily = asObject(nestedValue(inverterEquipment, ["deviceList", "data", "dailyProduction"])) || {};
  const deviceEnergy = asObject(inverterEnergy) || {};
  const plantInfo = asObject(plantDetail?.detail) || plantDetail || {};
  const plantWeather = asObject(plantDetail?.weather) || asObject(plantInfo.weather) || {};
  const flow = plantFlow || {};
  const flowStorage = Boolean(flow.storageFlag) || Boolean(plantInfo.isStorage);
  const flowGenerator = Boolean(flow.generatorFlag);
  const visibleAlerts = alertLevel === "all" ? alerts : alerts.filter((row) => Number(row.level) === alertLevel);
  const title = selectedPlant ? getName(selectedPlant) : routes.find((item) => item.id === view)?.label || "总览";
  const nav = (item: View) => { setView(item); setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setInverter(null); location.hash = `#${item}`; if (item === "devices" && mode === "live") void refresh(); };

  return <div className="desktop-app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">☼</span><span><b>光伏数据台</b><small>SOLARSPACE</small></span></div>
      <div className={`account-card ${sample ? "sample-account" : ""}`}>
        <span className="account-avatar">{sample ? "样" : "光"}</span>
        <span><b>{sample ? "离线示例数据" : mode === "live" ? "爱士惟账户" : "尚未连接账户"}</b><small>{sample ? "本机样例 · 不含实时数据" : mode === "live" ? "只读数据连接" : "登录由爱士惟窗口处理"}</small></span>
        <span className="tiny-dot" />
      </div>
      <div className="nav-caption">工作区</div>
      <nav>{routes.map((item) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => nav(item.id)}><span className="nav-glyph">{item.glyph}</span>{item.label}{item.id === "plants" && rows.length > 0 && <small>{rows.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="connection-card"><span className={`connection-indicator ${mode === "live" ? "connected" : sample ? "sample" : ""}`} /><div><b>{mode === "live" ? "账户已连接" : sample ? "离线示例模式" : connection.status === "login-window-open" ? "等待完成登录" : "未连接"}</b><small>{mode === "live" ? "数据来自爱士惟账户" : sample ? "所有数据均为示例" : "连接后读取真实电站"}</small></div></div>
        {mode === "live" ? <button className="side-action" onClick={() => void disconnect()} disabled={busy}>断开账户</button> : sample ? <button className="side-action" onClick={() => void leaveSample()}>退出示例体验</button> : <button className="side-action" onClick={() => void connect()}>连接爱士惟账户</button>}
        <div className="sidebar-foot">本机只读客户端 <span>v1.2.0</span></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs">光伏数据台 <span>/</span> {title}</div><div className="topbar-actions">
        {sample && <span className="sample-badge">离线示例 · 样例数据</span>}
        <span className={`top-status ${mode === "live" ? "is-live" : sample ? "is-sample" : ""}`}><i />{mode === "live" ? "实时账户" : sample ? "离线示例" : connection.status === "login-window-open" ? "登录窗口已打开" : "等待连接"}</span>
        <button className="avatar-button" title="账户状态" onClick={() => mode === "live" ? void disconnect() : mode === "sample" ? void leaveSample() : void connect()}>{mode === "live" ? "连" : sample ? "样" : "未"}</button>
      </div></header>

      <div className="page-wrap">
        {mode === "disconnected" && view !== "service" && <section className="welcome-panel">
          <div className="welcome-copy"><span className="eyebrow"><i /> 桌面只读客户端</span><h1>把你的电站数据<br /><em>带回本机查看。</em></h1><p>通过爱士惟官方登录窗口连接账户。登录信息由爱士惟窗口处理，客户端只读取电站与设备数据。</p>
            <div className="welcome-actions"><button className="primary-action" onClick={() => void connect()}>连接爱士惟账户 <span>→</span></button><button className="text-action" onClick={enterSample}>离线示例体验</button></div>
            {connection.status === "login-window-open" && <div className="login-hint"><span className="spinner" />登录完成后，本窗口会检测连接状态。</div>}
          </div><div className="welcome-art" aria-hidden="true"><div className="sun-orb" /><div className="roof-lines"><i /><i /><i /><i /><i /><i /></div><div className="art-label">LOCAL · READ ONLY</div></div>
        </section>}

        {mode === "disconnected" && view === "service" && <section className="panel warranty-panel"><div className="panel-heading"><div><h2>设备质保信息</h2><p>只读查询 · 数据来自账户服务接口</p></div></div><EmptyState title="尚未连接账户" text="连接爱士惟账户后查询设备质保信息。" /><button className="primary-action" onClick={() => void connect()}>连接爱士惟账户</button></section>}

        {mode !== "disconnected" && <>
          {sample && <div className="mode-notice"><span>样</span><div><b>当前为离线示例体验</b><small>本页内容为虚构样例。连接真实账户后会清除所有示例数据。</small></div><button onClick={() => void leaveSample()}>退出示例</button></div>}
          <section className="page-heading"><div><div className="date-caption">{new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date())}</div><h1>{selectedPlant ? getName(selectedPlant) : view === "overview" ? "电站运行总览" : view === "plants" ? "电站管理" : view === "devices" ? "设备管理" : view === "alerts" ? "告警中心" : "服务信息"}</h1><p>{selectedPlant ? "查看该电站的实时详情与设备数据" : view === "overview" ? (sample ? "样例数据概览" : "账户中电站的当前运行情况") : view === "plants" ? "从账户读取的电站列表与运行状态" : view === "devices" ? "选择设备查看逆变器数据" : view === "alerts" ? "账户下所有电站的当前故障与历史告警" : "查询账户设备的质保信息"}</p></div><div className="heading-actions">{!sample && <button className="secondary-action" onClick={() => void refresh()} disabled={busy}><span className={busy ? "spin-icon" : ""}>↻</span>{busy ? "读取中" : "刷新数据"}</button>}{view === "plants" && !selectedPlant && <button className="secondary-action" onClick={() => void exportCsv()} disabled={exporting || busy}>{exporting ? "准备导出…" : "导出 CSV"}</button>}</div></section>

          {error && <div className="feedback error-feedback"><span>!</span><p>{error}</p><button onClick={() => setError("")}>关闭</button></div>}
          {notice && <div className="feedback notice-feedback"><span>✓</span><p>{notice}</p><button onClick={() => setNotice("")}>关闭</button></div>}

          {!selectedPlant && view === "overview" && <>
            <div className="section-title"><div><h2>运行指标</h2><p>{sample ? "仅用于体验界面，不代表实际运行数据" : "来自当前账户的数据响应，缺失字段会留空"}</p></div><span className="snapshot-label">账户最新数据</span></div>
            {sample ? <div className="metric-grid"><Metric label="今日发电" value={sampleSummary.today} unit="kWh" accent="orange"/><Metric label="本月发电" value={sampleSummary.month} unit="kWh" accent="blue"/><Metric label="累计发电" value={(sampleSummary.total / 1000).toFixed(2)} unit="MWh" accent="green"/><Metric label="碳减排" value={sampleSummary.co2} unit="t" accent="purple"/><Metric label="今日收益" value={(sampleSummary.today * 0.4).toFixed(2)} unit="￥"/><Metric label="本月收益" value={(sampleSummary.month * 0.4).toFixed(0)} unit="￥" accent="orange"/><Metric label="累计收益" value={(sampleSummary.total * 0.4).toFixed(0)} unit="￥" accent="blue"/><Metric label="示例电站" value={rows.length} unit="座" accent="green"/></div> : <><div className="metric-grid">
              <Metric label="今日发电" value={statistics.etoday} unit={statistics.etodayUnit} accent="orange" />
              <Metric label="本月发电" value={statistics.emonth} unit={statistics.emonthUnit} accent="blue" />
              <Metric label="累计发电" value={statistics.etotal} unit={statistics.etotalUnit} accent="green" />
              <Metric label="当前功率" value={powerStats.pac} unit={powerStats.pacUnit} accent="purple" hint={powerStats.percent !== undefined ? `装机占比 ${fmt(powerStats.percent)}%` : undefined} />
              <Metric label="今日收益" value={income.todayincome} unit={moneyUnit} />
              <Metric label="本月收益" value={income.monthincome} unit={moneyUnit} accent="orange" />
              <Metric label="累计收益" value={income.totalincome} unit={moneyUnit} accent="blue" />
              <Metric label="碳减排" value={social.co2} unit={social.co2Unit} accent="green" hint={social.tree !== undefined ? `≈ 植树 ${fmt(social.tree)} 棵 · 标煤 ${fmt(social.coal)} ${fmt(social.coalUnit)}` : undefined} />
            </div><div className="status-strip">
              <span className="stat-chip"><i className="stat-dot online" />在线 {fmt(dashboardData.online)} 座</span>
              <span className="stat-chip"><i className="stat-dot offline" />离线 {fmt(dashboardData.offline)} 座</span>
              <span className="stat-chip"><i className="stat-dot warn" />告警 {fmt(dashboardData.warning)} 座</span>
              <span className="stat-chip"><i className="stat-dot fault" />故障 {fmt(dashboardData.error)} 座</span>
              <span className="stat-chip">电站总数 {fmt(dashboardData.all)} 座</span>
              <span className="stat-chip">装机容量 {fmt(powerStats.totalPower)} kWp</span>
              <span className="stat-chip">已运行 {fmt(dashboardData.meetDays)} 天</span>
            </div></>}
            <section className="panel trend-panel"><div className="panel-heading trend-heading"><div><h2>发电趋势</h2><p>{sample ? "示例数据 · 按天与按月发电量" : "账户发电量与收益 · 只读数据"}</p></div><div className="trend-controls"><div className="period-control">{TREND_PERIODS.map((item) => <button key={item.id} className={trendPeriod === item.id ? "selected" : ""} onClick={() => setTrendPeriod(item.id)}>{item.label}</button>)}</div><div className="period-control">{[{ id: 1 as const, label: "发电量" }, { id: 2 as const, label: "收益" }].map((item) => <button key={item.id} className={trendForm === item.id ? "selected" : ""} onClick={() => setTrendForm(item.id)}>{item.label}</button>)}</div></div></div>{trendBusy && !sample ? <LoadingState /> : <TrendView value={sample ? sampleTrend(trendPeriod, trendForm) : trend} label={trendForm === 1 ? "发电量" : "收益"} xUnit={TREND_PERIODS.find((item) => item.id === trendPeriod)?.xUnit} />}</section>
            <div className="dashboard-grid"><section className="panel plants-panel"><div className="panel-heading"><div><h2>电站</h2><p>{sample ? "本机样例电站" : "账户电站列表"}</p></div><button className="inline-action" onClick={() => nav("plants")}>查看全部 →</button></div><PlantList rows={rows.slice(0, 5)} sample={sample} onSelect={(row) => void openPlant(row)} /></section>
              <section className="panel account-panel"><div className="panel-heading"><div><h2>账户数据</h2><p>{sample ? "示例模式持续显示标记" : "连接状态与最近读取结果"}</p></div><span className={`panel-status ${mode === "live" ? "good" : "sample"}`}><i />{mode === "live" ? "已连接" : "示例"}</span></div>{sample ? <DataRows value={dashboardData} /> : dashboard ? <DataRows value={dashboard} /> : <EmptyState title="暂无总览数据" text="点击刷新重新读取账户数据。" />}</section></div>
          </>}

          {!selectedPlant && view === "plants" && <section className="panel list-panel"><div className="panel-heading list-heading"><div><h2>账户电站 <span className="count">{rows.length}</span></h2><p>{sample ? "示例记录" : "数据来自爱士惟账户"}</p></div><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索电站名称或编号" /></label></div><PlantList rows={visibleRows} sample={sample} onSelect={(row) => void openPlant(row)} /><div className="list-footer">显示 {visibleRows.length} 条记录{!sample && " · 只读数据"}</div></section>}

          {selectedPlant && view === "plants" && <>
            <div className="detail-toolbar"><button className="back-action" onClick={() => { setSelectedPlant(null); setPlantDetail(null); setPlantFlow(null); setDevices([]); }}>← 返回电站列表</button><span className="detail-id">{getId(selectedPlant) || "电站详情"}</span></div>
            {!sample && <section className="panel flow-panel"><div className="panel-heading"><div><h2>实时能流</h2><p>{flow.lastUpdateTime ? `数据时间 ${fmt(flow.lastUpdateTime)}` : "电站实时功率快照 · 只读"}</p></div><span className="panel-status good"><i />{plantFlow ? "实时" : "无数据"}</span></div>{!plantFlow ? <EmptyState title="暂无实时能流" text="该电站未返回实时功率数据。" /> : <div className="flow-grid"><FlowStat label="光伏" value={flow.pv} unit={flow.pv_u} accent="orange" /><FlowStat label="电网" value={flow.grid} unit={flow.grid_u} accent="blue" /><FlowStat label="负载" value={flow.load} unit={flow.load_u} accent="green" />{flowStorage && <FlowStat label="电池" value={flow.battery} unit={flow.battery_u} accent="purple" />}{flowStorage && <FlowStat label="电池 SOC" value={flow.soc} unit={flow.soc_u} />}{flowGenerator && <FlowStat label="发电机" value={flow.generator} unit={flow.generator_u} />}</div>}</section>}
            <div className="detail-grid"><section className="panel detail-panel"><div className="panel-heading"><div><h2>电站档案</h2><p>{sample ? "虚构示例数据" : "并网信息、电价、收益与环保数据"}</p></div></div>{busy && !plantDetail ? <LoadingState /> : plantDetail ? <>
              <div className="plant-facts">
                <Fact label="装机容量" value={plantInfo.totalpower} hint="kWp" />
                <Fact label="当前功率" value={Number(plantInfo.ePower) / 1000} hint="kW · 接口单位为 W" />
                <Fact label="今日发电" value={plantInfo.eToday} hint="kWh" />
                <Fact label="累计发电" value={Number(plantInfo.eTotal) / 1000} hint="MWh" />
                <Fact label="今日收益" value={asObject(plantInfo.savings)?.daily} hint={String(asObject(plantInfo.savings)?.money ?? "￥")} />
                <Fact label="累计收益" value={asObject(plantInfo.savings)?.total} hint={String(asObject(plantInfo.savings)?.money ?? "￥")} />
                <Fact label="碳减排" value={asObject(plantInfo.savings)?.co2} hint={asObject(plantInfo.savings)?.co2 ? `kg · ≈ ${(Number(asObject(plantInfo.savings)?.co2) / 1000).toFixed(2)} t` : "kg"} />
                <Fact label="并网日期" value={formatTimestamp(plantInfo.startdt)} />
                <Fact label="建档时间" value={formatTimestamp(plantInfo.createdt)} />
                <Fact label="上网电价" value={plantInfo.gainxs} hint="￥/kWh" />
                <Fact label="购电价" value={plantInfo.buyxs} hint="￥/kWh" />
                <Fact label="设备数量" value={plantInfo.pmuNum} hint="台" />
                <Fact label="当前告警" value={plantInfo.warnNum} hint="条" />
                <Fact label="当前故障" value={plantInfo.errNum} hint="条" />
                <Fact label="位置" value={plantInfo.provinceStr ?? plantInfo.city} hint={String(plantInfo.street ?? "")} />
                <Fact label="坐标" value={plantInfo.longitude && plantInfo.latitude ? `${Number(plantInfo.longitude).toFixed(4)}, ${Number(plantInfo.latitude).toFixed(4)}` : undefined} hint={String(plantInfo.timezoneStr ?? "")} />
                <Fact label="天气" value={plantWeather.text} hint={plantWeather.tmp !== undefined ? `${fmt(plantWeather.tmp)}°C · 风速 ${fmt(plantWeather.windSpd)}` : undefined} />
                <Fact label="日出 / 日落" value={plantWeather.sunrise && plantWeather.sunset ? `${fmt(plantWeather.sunrise)} / ${fmt(plantWeather.sunset)}` : undefined} />
              </div>
              <details className="raw-payload"><summary>查看完整电站字段</summary><DataRows value={plantDetail} /></details>
            </> : <EmptyState title="暂无电站详情" text="刷新后重试，或返回电站列表。" />}</section>
              <section className="panel detail-panel"><div className="panel-heading"><div><h2>设备列表</h2><p>{devices.length} 台设备记录</p></div></div>{deviceReadError ? <EmptyState title="设备读取失败" text={deviceReadError} /> : busy ? <LoadingState /> : devices.length ? devices.map((device, index) => <DeviceRow key={String(getValue(device, ["isno", "sn", "id"]) ?? index)} row={device} onClick={() => void openInverter(device)} />) : <EmptyState title="没有设备明细" text={sample ? "示例电站未配置设备数据。" : "该电站当前没有设备记录。"} />}</section></div>
            {inverter && <section className="panel inverter-panel"><div className="panel-heading"><div><h2>逆变器详情</h2><p>{String(getValue(inverter, ["byname", "name", "isno"]) ?? getValue(deviceRow || {}, ["isno"]) ?? "")}</p></div><button className="inline-action" onClick={() => { setInverter(null); setDeviceRow(null); }}>收起</button></div>
              <div className="device-identity"><DeviceSummary device={deviceRow} inverter={inverter} /></div>
              <div className="electrical-grid"><ElectricalTable title="直流 · MPPT 输入" rows={nestedRows(inverterStorage, ["deviceList", "data", "pvList"])} mode="mppt" />
                <ElectricalTable title="交流 · 三相输出" rows={nestedRows(inverterStorage, ["deviceList", "data", "acList"])} mode="phase" />
                <ElectricalTable title="EPS 输出" rows={nestedRows(inverterStorage, ["deviceList", "data", "epsList"])} mode="phase" />
                <section className="panel subpanel"><div className="panel-heading"><div><h3>每日发电数据</h3><p>设备接口返回内容</p></div></div><DataRows value={nestedValue(inverterEquipment, ["deviceList", "data", "dailyProduction"]) ?? inverterEnergy ?? null} /></section></div>
              <section className="panel trend-panel device-trend-panel"><div className="panel-heading trend-heading"><div><h2>发电统计</h2><p>{deviceTrendPeriod === "month" ? "本月每日发电量" : "本年度每月发电量"} · 直流与交流</p></div><div className="period-control"><button className={deviceTrendPeriod === "month" ? "selected" : ""} onClick={() => setDeviceTrendPeriod("month")}>本月</button><button className={deviceTrendPeriod === "year" ? "selected" : ""} onClick={() => setDeviceTrendPeriod("year")}>本年</button></div></div>
                <div className="device-stat-strip">
                  <div className="device-stat"><small>今日直流</small><b>{fmt(deviceDaily.dc)}<em>kWh</em></b></div>
                  <div className="device-stat"><small>今日交流</small><b>{fmt(deviceDaily.ac)}<em>kWh</em></b></div>
                  <div className="device-stat"><small>累计直流</small><b>{fmt(deviceEnergy.dc)}<em>{fmt(deviceEnergy.unit)}</em></b></div>
                  <div className="device-stat"><small>累计交流</small><b>{fmt(deviceEnergy.ac)}<em>{fmt(deviceEnergy.unit)}</em></b></div>
                  <div className="device-stat"><small>累计运行</small><b>{fmt(deviceEnergy.hotal)}<em>{fmt(deviceEnergy.hotalUnit)}</em></b></div>
                </div>
                {deviceTrendBusy ? <LoadingState /> : <TrendView value={deviceTrend} label="发电量" xUnit={deviceTrendPeriod === "month" ? "日" : "月"} split />}
              </section>
              <div className="history-panel"><div className="history-head"><div><h3>历史曲线</h3><p>选择日期和指标读取账户数据</p></div><div className="history-controls"><input type="date" value={historyDate} onChange={(event) => { setHistoryDate(event.target.value); setHistoryPage(0); }} /><select value={historyMetric} onChange={(event) => { setHistoryMetric(event.target.value); setHistoryPage(0); }}><option value="vpv">输入电压</option><option value="ipv">输入电流</option><option value="vac">输出电压</option><option value="iac">输出电流</option><option value="pac">输出功率</option><option value="pdc">输入功率</option><option value="fac">频率</option><option value="temperature">温度</option>{Number(getValue(inverter, ["isAiLogger"]) ?? 0) === 1 ? <option value="soc">电池 SOC</option> : <option value="str">组串电流</option>}</select><button className="secondary-action" onClick={() => void loadHistory()} disabled={busy}>查询</button></div></div><HistoryView value={historyData} metric={historyMetric} label={HISTORY_METRIC_LABELS[historyMetric] ?? historyMetric} page={historyPage} onPageChange={setHistoryPage} /></div>
              <details className="raw-payload"><summary>查看完整设备数据（接口原始字段）</summary><div className="raw-grid"><section><h3>逆变器信息</h3><DataRows value={inverter} /></section><section><h3>设备原始字段</h3><DataRows value={deviceSourceFields(deviceRow)} /></section><section><h3>直流 / 交流数据</h3><DataRows value={inverterStorage} /></section><section><h3>设备统计</h3><DataRows value={inverterEquipment} /></section><section><h3>发电数据</h3><DataRows value={inverterEnergy} /></section><section><h3>历史曲线响应</h3><DataRows value={historyData} /></section></div></details>
            </section>}
          </>}

          {!selectedPlant && view === "devices" && <section className="panel list-panel"><div className="panel-heading"><div><h2>设备管理 <span className="count">{devices.length}</span></h2><p>来自账户设备组；点击逆变器可查看直流、交流与历史数据。只读模式。</p></div></div>{deviceReadError ? <EmptyState title="设备列表读取失败" text={deviceReadError} /> : busy ? <LoadingState /> : devices.length ? devices.map((device, index) => <DeviceRow key={`${String(getValue(device, ["isno", "sn"]) ?? index)}-${index}`} row={device} onClick={() => void openInverter(device)} />) : <EmptyState title="暂无设备数据" text="账户当前没有设备记录。刷新后会按电站重新读取设备组。" />}</section>}

          {view === "alerts" && <section className="panel alerts-panel"><div className="panel-heading"><div><h2>故障与告警记录 <span className="count">{visibleAlerts.length}</span></h2><p>跨电站汇总当前故障与历史记录 · 只读</p></div><div className="alert-controls"><div className="period-control">{[{ id: "all" as const, label: "全部" }, { id: 3 as const, label: "故障" }, { id: 2 as const, label: "告警" }].map((item) => <button key={String(item.id)} className={alertLevel === item.id ? "selected" : ""} onClick={() => setAlertLevel(item.id)}>{item.label}</button>)}</div><button className="secondary-action" onClick={() => void loadAlerts()} disabled={alertsBusy}>{alertsBusy ? "读取中" : "刷新"}</button></div></div>
            {mode !== "live" ? <EmptyState title="尚未连接账户" text="连接账户后汇总各电站的故障与告警记录。" /> : alertsBusy && !alerts.length ? <LoadingState /> : <>
              <div className="status-strip alert-summary">
                <span className="stat-chip"><i className="stat-dot fault" />当前故障 {activeAlerts.length} 条</span>
                <span className="stat-chip"><i className="stat-dot fault" />历史故障 {alerts.filter((row) => Number(row.level) === 3).length} 条</span>
                <span className="stat-chip"><i className="stat-dot warn" />历史告警 {alerts.filter((row) => Number(row.level) === 2).length} 条</span>
                <span className="stat-chip">涉及设备 {new Set(alerts.map((row) => String(row.isno ?? ""))).size} 台</span>
              </div>
              {alertsError && <div className="feedback error-feedback"><span>!</span><p>{alertsError}</p><button onClick={() => setAlertsError("")}>关闭</button></div>}
              {visibleAlerts.length ? <div className="alerts-table-wrap"><table className="alerts-table"><thead><tr><th>发生时间</th><th>电站</th><th>设备</th><th>代码</th><th>描述</th><th>级别</th></tr></thead><tbody>{visibleAlerts.map((row, index) => <tr key={`${String(row.isno)}-${String(row.occdt ?? index)}-${index}`}><td>{String(row.occdtTime ?? formatTimestamp(row.occdt ?? row.tmstp))}</td><td>{String(row.plantName ?? "—")}</td><td><b>{String(row.byname ?? row.isno ?? "—")}</b><small>{String(row.isno ?? "")}</small></td><td>{fmt(row.errCode)}</td><td>{String(row.context ?? "—")}</td><td><span className={`alert-level level-${Number(row.level) === 3 ? "fault" : "warn"}`}>{levelLabel(row.level)}</span></td></tr>)}</tbody></table></div> : <EmptyState title="没有告警记录" text="账户下所有电站在该范围内没有故障或告警记录。" />}
            </>}</section>}

          {view === "service" && <section className="panel warranty-panel"><div className="panel-heading"><div><h2>设备质保信息</h2><p>只读查询 · 数据来自账户服务接口</p></div></div>{sample ? <div className="mode-notice warranty-sample"><span>样</span><div><b>离线示例模式不查询真实质保信息</b><small>退出示例并连接账户后，可查询真实设备质保记录。</small></div></div> : mode !== "live" ? <EmptyState title="尚未连接账户" text="连接爱士惟账户后查询设备质保信息。" /> : <><div className="warranty-query"><label>设备序列号<select value={warrantySerial} onChange={(event) => setWarrantySerial(event.target.value)}><option value="">选择已读取设备</option>{devices.map((device, index) => { const serial = String(getValue(device, ["isno", "sn", "serialNo"]) ?? ""); return serial ? <option key={`${serial}-${index}`} value={serial}>{String(getValue(device, ["byname", "name"]) ?? serial)} · {serial}</option> : null; })}</select></label><input aria-label="手动输入设备序列号" value={warrantySerial} onChange={(event) => setWarrantySerial(event.target.value)} placeholder="也可手动输入设备序列号" /><button className="primary-action" onClick={() => void queryWarranty()} disabled={warrantyBusy}>{warrantyBusy ? "查询中…" : "查询质保"}</button></div>{warrantyData ? <><div className="warranty-fields"><WarrantyField label="设备序列号" value={warrantyData.isn ?? warrantyData.isno} /><WarrantyField label="标准质保年限" value={warrantyData.std_warrantyyear} suffix="年" /><WarrantyField label="延长质保年限" value={warrantyData.ext_warrantyyear} suffix="年" /><WarrantyField label="质保开始日期" value={warrantyData.std_warranty_date} /><WarrantyField label="质保到期日期" value={warrantyData.ext_warranty_date} /></div><details className="raw-payload"><summary>查看完整质保响应</summary><DataRows value={warrantyData} /></details></> : <EmptyState title="暂无质保结果" text="选择或输入序列号后查询；未查询前不会显示虚构数据。" />}</>}</section>}
        </>}

        <footer className="app-footer"><span>SOLARSPACE</span><span>本机运行 · 只读数据</span>{sample && <b>示例数据模式</b>}</footer>
      </div>
    </main>
  </div>;
}

function PlantList({ rows, sample, onSelect }: { rows: Row[]; sample: boolean; onSelect: (row: Row) => void }) {
  if (!rows.length) return <EmptyState title="暂无电站记录" text={sample ? "示例列表为空。" : "连接账户后读取到的电站会显示在这里。"} />;
  return <div className="plant-table"><div className="plant-table-head"><span>电站</span><span>状态</span><span>今日发电</span><span>累计发电</span><span>装机容量</span><span>当前功率</span><span /></div>{rows.map((row, index) => {
    const state = statusLabel(getValue(row, ["status", "plantStatus"]));
    const location = getValue(row, ["location", "address", "plantAddress"]);
    return <button className="plant-row" key={`${getId(row)}-${index}`} onClick={() => onSelect(row)}><span className="plant-name-cell"><i className="plant-icon">⌂</i><span><b>{getName(row)}</b><small>{fmt(location === undefined ? getId(row) : location)}</small></span></span><span className={`status-chip ${/故障|离线|fault|offline/i.test(state) ? "warn" : ""}`}>{state || "—"}</span><span>{fmt(getValue(row, ["etoday", "today", "e_today", "todayEnergy"]))}<small>{fmt(getValue(row, ["etodayUnit", "todayUnit", "e_todayUnit"]))}</small></span><span>{fmt(getValue(row, ["etotal", "total", "totalEnergy", "e_total"]))}<small>{fmt(getValue(row, ["etotalUnit", "totalUnit", "e_totalUnit"]))}</small></span><span>{fmt(getValue(row, ["totalpower", "capacity", "installedCapacity", "designCapacity", "totalcapacity"]))}<small>{fmt(getValue(row, ["capacityUnit"]) ?? (row.totalpower !== undefined ? "kWp" : undefined))}</small></span><span>{fmt(getValue(row, ["power", "pac"]))}<small>{fmt(getValue(row, ["powerUnit", "pacUnit"]))}</small></span><span className="row-chevron">›</span></button>;
  })}</div>;
}

function WarrantyField({ label, value, suffix = "" }: { label: string; value: unknown; suffix?: string }) {
  return <div className="warranty-field"><small>{label}</small><b>{value === undefined || value === null || value === "" ? "—" : `${fmt(value)}${suffix}`}</b></div>;
}

function DeviceSummary({ device, inverter }: { device: Row | null; inverter: Row | null }) {
  const source = { ...(device || {}), ...(inverter || {}) };
  const fields: [string, string][] = [
    ["设备名称", fmt(getValue(source, ["byname", "name"]) ?? getValue(source, ["devtypename"]))], ["型号", fmt(getValue(source, ["devtypename", "hostType", "model"]))],
    ["设备序列号", fmt(getValue(source, ["isno", "sn", "serialNo"]))], ["采集器序列号", fmt(getValue(source, ["psno"]))],
    ["固件版本", fmt(getValue(source, ["softver", "softwareVersion", "firmwareVersion"]))], ["安全版本", fmt(getValue(source, ["safetyver"]))],
    ["通信版本", fmt(getValue(source, ["cpv"]))], ["Modbus 地址", fmt(getValue(source, ["modbusNo"]))],
    ["最大功率", metricWithUnit(getValue(source, ["maxPower"]), "W")], ["所属电站", fmt(getValue(source, ["stationname"]))],
    ["状态", statusLabel(getValue(source, ["status", "state"]))],
    ["更新时间", fmt(getValue(source, ["ludt", "updateTime", "lastUpdateTime"]))],
    ["今日发电", metricWithUnit(getValue(source, ["e_today", "etoday"]), getValue(source, ["e_todayUnit", "etodayUnit"]))],
    ["本月发电", metricWithUnit(getValue(source, ["emonth"]), getValue(source, ["emonth_u"]))],
    ["累计发电", metricWithUnit(getValue(source, ["etotal", "e_total"]), getValue(source, ["etotal_u", "etotalUnit", "e_totalUnit"]))],
    ["当前功率", metricWithUnit(getValue(source, ["pac", "power"]), getValue(source, ["pac_u", "pacUnit", "powerUnit"]))],
  ];
  return <div className="device-summary">{fields.map(([label, value]) => <div className="device-summary-item" key={label}><small>{label}</small><b>{value}</b></div>)}</div>;
}

function DeviceRow({ row, onClick }: { row: Row; onClick: () => void }) {
  const metric = (keys: string[], unitKeys: string[], fallback: string) => {
    const value = getValue(row, keys);
    if (value === undefined) return "—";
    const unit = getValue(row, unitKeys) ?? fallback;
    return `${fmt(value)} ${fmt(unit)}`;
  };
  return <button className="device-row" onClick={onClick}>
    <span className="device-icon">▦</span>
    <span className="device-info"><b>{String(getValue(row, ["byname", "name", "hostType", "devtypename"]) ?? "设备")}</b><small>{String(getValue(row, ["isno", "sn", "serialNo"]) ?? "序列号 —")}</small></span>
    <span className="device-metric"><small>今日</small><b>{metric(["e_today", "today"], ["e_todayUnit"], "kWh")}</b></span>
    <span className="device-metric"><small>本月</small><b>{metric(["emonth"], ["emonth_u"], "MWh")}</b></span>
    <span className="device-metric"><small>累计</small><b>{metric(["etotal"], ["etotal_u"], "MWh")}</b></span>
    <span className="device-metric"><small>功率</small><b>{metric(["pac"], ["pac_u"], "kW")}</b></span>
    <span className="device-status">{statusLabel(getValue(row, ["status", "state"]))}</span>
    <span className="row-chevron">›</span>
  </button>;
}

function nestedValue(source: unknown, path: string[]): unknown {
  const find = (current: unknown, index: number): unknown => {
    if (index >= path.length) return current;
    const object = asObject(current);
    if (object && object[path[index]] !== undefined) return find(object[path[index]], index + 1);
    if (object) {
      for (const wrapper of ["result", "data"]) {
        if (object[wrapper] !== undefined) {
          const found = find(object[wrapper], index);
          if (found !== undefined) return found;
        }
      }
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        const found = find(item, index);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return find(source, 0);
}

function nestedRows(source: unknown, path: string[]): Row[] {
  const value = nestedValue(source, path);
  return Array.isArray(value) ? value.filter((item): item is Row => !!asObject(item)) : [];
}

function ElectricalTable({ title, rows, mode }: { title: string; rows: Row[]; mode: "mppt" | "phase" }) {
  return <section className="panel subpanel"><div className="panel-heading"><div><h3>{title}</h3><p>{rows.length} 个通道</p></div></div>{rows.length ? <div className="electrical-table-wrap"><table className="electrical-table"><thead><tr><th>{mode === "mppt" ? "MPPT" : "相位"}</th><th>电压 (V)</th><th>电流 (A)</th><th>功率 (W)</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${fmt(getValue(row, [mode === "mppt" ? "mppt" : "unit"]))}-${index}`}><td>{fmt(getValue(row, [mode === "mppt" ? "mppt" : "unit"]))}</td><td>{fmt(getValue(row, ["v", "voltage"]))}</td><td>{fmt(getValue(row, ["i", "current"]))}</td><td>{fmt(getValue(row, ["p", "power"]))}</td></tr>)}</tbody></table></div> : <EmptyState title="暂无通道数据" text="账户没有返回该项数据。" />}</section>;
}

const TREND_PERIODS: { id: "month" | "year" | "total"; label: string; xUnit: string }[] = [
  { id: "month", label: "本月", xUnit: "日" },
  { id: "year", label: "本年", xUnit: "月" },
  { id: "total", label: "累计", xUnit: "" },
];

function sampleTrend(period: "month" | "year" | "total", form: 1 | 2): Row {
  const now = new Date();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const x = period === "month" ? Array.from({ length: days }, (_, index) => String(index + 1))
    : period === "year" ? Array.from({ length: 12 }, (_, index) => String(index + 1))
    : ["2024", "2025", String(now.getFullYear())];
  const base = form === 1
    ? (period === "month" ? 96 : period === "year" ? 2.6 : 30)
    : (period === "month" ? 38 : period === "year" ? 980 : 12000);
  const y = x.map((_, index) => Number((base * (0.55 + 0.65 * Math.abs(Math.sin(index * 1.17 + 1.4)))).toFixed(2)));
  return { x, y, unit: form === 1 ? (period === "month" ? "kWh" : "MWh") : "￥" };
}

function TrendView({ value, label, xUnit = "", split = false }: { value: Row | null; label: string; xUnit?: string; split?: boolean }) {
  const object = asObject(value);
  if (!object) return <EmptyState title="暂无发电趋势" text="连接账户后读取该周期的发电数据。" />;
  const x = Array.isArray(object.x) ? object.x : [];
  let series: { name: string; values: unknown[] }[] = [];
  const list = Array.isArray(object.list) ? object.list : [];
  if (list.length) {
    series = list.filter((item) => !!asObject(item)).map((item) => {
      const row = item as Row;
      const name = String(row.name ?? "");
      return { name: name === "ac" ? "交流" : name === "dc" ? "直流" : name || "序列", values: Array.isArray(row.value) ? row.value : [] };
    });
  } else if (split) {
    const data = asObject(object.data) || {};
    if (Array.isArray(data.ac)) series.push({ name: "交流", values: data.ac });
    if (Array.isArray(data.dc)) series.push({ name: "直流", values: data.dc });
  }
  if (!series.length) series = [{ name: label, values: Array.isArray(object.y) ? object.y : [] }];
  if (!x.length || !series.some((item) => item.values.length)) return <EmptyState title="没有可展示的数据点" text="接口已返回，但该周期没有发电记录。" />;
  return <TrendChart x={x} series={series} unit={object.unit} xUnit={xUnit} />;
}

const HISTORY_METRIC_LABELS: Record<string, string> = {
  vpv: "输入电压", ipv: "输入电流", vac: "输出电压", iac: "输出电流", pac: "输出功率",
  pdc: "输入功率", fac: "频率", temperature: "温度", soc: "电池 SOC", str: "组串电流",
};

function HistoryView({ value, metric, label, page, onPageChange }: { value: Row | null; metric: string; label: string; page: number; onPageChange: (page: number) => void }) {
  const data = asObject(nestedValue(value, ["data"])) || value;
  const item = asObject(data ? data[metric] : undefined);
  if (!item) return <EmptyState title="暂无历史曲线" text="选择日期和指标后点击查询。没有返回数据时不会填入示例值。" />;
  const x = Array.isArray(item.x) ? item.x : [];
  const y = Array.isArray(item.y) ? item.y : [];
  const series: unknown[][] = y.length && y.every(Array.isArray) ? y as unknown[][] : [y];
  const count = Math.max(x.length, ...series.map((entry) => entry.length));
  if (!count) return <EmptyState title="该指标没有记录" text="接口已返回，但没有可显示的时间点。" />;
  const seriesNames = series.length === 1 ? [label] : series.map((_, index) => `序列 ${index + 1}`);
  const timeLabel = (raw: unknown) => {
    if (typeof raw !== "number" && !(typeof raw === "string" && /^\d{10,13}$/.test(raw))) return fmt(raw);
    const numeric = Number(raw);
    const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? fmt(raw) : new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date);
  };
  const pageSize = 30;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const end = Math.min(count, start + pageSize);
  return <><HistoryChart x={x} series={series.map((entry, index) => ({ name: seriesNames[index], values: entry }))} unit={item.unit} /><div className="history-table-wrap"><table className="electrical-table history-table"><thead><tr><th>时间</th>{series.map((_, index) => <th key={index}>{seriesNames[index]}{item.unit ? ` (${fmt(item.unit)})` : ""}</th>)}</tr></thead><tbody>{Array.from({ length: end - start }, (_, offset) => { const index = start + offset; return <tr key={index}><td>{timeLabel(x[index])}</td>{series.map((entry, seriesIndex) => <td key={seriesIndex}>{fmt(entry[index])}</td>)}</tr>; })}</tbody></table></div><div className="history-pagination"><span>{count} 个时间点 · 第 {currentPage + 1}/{pageCount} 页</span><div><button className="secondary-action" disabled={currentPage <= 0} onClick={() => onPageChange(currentPage - 1)}>上一页</button><button className="secondary-action" disabled={currentPage >= pageCount - 1} onClick={() => onPageChange(currentPage + 1)}>下一页</button></div></div></>;
}

function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span>⌂</span><b>{title}</b><p>{text}</p></div>; }
function LoadingState() { return <div className="loading-state"><span className="spinner" />读取账户数据…</div>; }

createRoot(document.getElementById("root")!).render(<App />);
