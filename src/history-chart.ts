export type ChartInputSeries = { name: string; values: unknown[]; color?: string };
export type ChartPoint = { index: number; x: number; y: number; value: number; time: unknown };
export type ChartSeriesModel = { name: string; color: string; path: string; points: ChartPoint[] };
export type HistoryChartModel = {
  width: number; height: number; plot: { left: number; top: number; right: number; bottom: number };
  ticks: { value: number; y: number }[]; series: ChartSeriesModel[]; count: number; validPointCount: number;
};

const COLORS = ["#d97846", "#5d91a4", "#7da06c", "#9279a6", "#d0a44d", "#5c79ad"];

function numeric(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildHistoryChartModel(
  times: unknown[],
  inputs: ChartInputSeries[],
  width = 920,
  height = 320,
): HistoryChartModel {
  const count = Math.max(times.length, ...inputs.map((series) => series.values.length), 0);
  const plot = { left: 58, top: 18, right: width - 20, bottom: height - 42 };
  const valid = inputs.flatMap((series) => series.values.map(numeric).filter((value): value is number => value !== undefined));
  if (!count || !valid.length) return { width, height, plot, ticks: [], series: [], count, validPointCount: 0 };

  let min = Math.min(...valid), max = Math.max(...valid);
  const padding = min === max ? Math.max(Math.abs(min) * 0.06, 1) : (max - min) * 0.08;
  min -= padding; max += padding;
  const plotWidth = Math.max(1, plot.right - plot.left), plotHeight = Math.max(1, plot.bottom - plot.top);
  const pointX = (index: number) => count === 1 ? plot.left + plotWidth / 2 : plot.left + (index / (count - 1)) * plotWidth;
  const pointY = (value: number) => plot.bottom - ((value - min) / (max - min)) * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = max - ((max - min) * index) / 4;
    return { value, y: pointY(value) };
  });
  let validPointCount = 0;
  const series = inputs.map((source, seriesIndex) => {
    let drawing = false;
    const commands: string[] = [];
    const points: ChartPoint[] = [];
    source.values.forEach((raw, index) => {
      const value = numeric(raw);
      if (value === undefined) { drawing = false; return; }
      const x = pointX(index), y = pointY(value);
      commands.push(`${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
      drawing = true;
      validPointCount += 1;
      points.push({ index, x, y, value, time: times[index] });
    });
    return { name: source.name, color: source.color || COLORS[seriesIndex % COLORS.length], path: commands.join(" "), points };
  });
  return { width, height, plot, ticks, series, count, validPointCount };
}

export function formatChartTime(raw: unknown, index: number): string {
  if (raw === undefined || raw === null || raw === "") return `时间点 ${index + 1}`;
  const value = typeof raw === "string" && /^\d{10,13}$/.test(raw) ? Number(raw) : raw;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date);
  }
  return String(raw);
}
