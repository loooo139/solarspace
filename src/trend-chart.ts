export type TrendInputSeries = { name: string; values: unknown[]; color?: string };
export type TrendBar = { index: number; x: number; y: number; width: number; height: number; value: number; label: string };
export type TrendSeriesModel = { name: string; color: string; bars: TrendBar[] };
export type TrendChartModel = {
  width: number;
  height: number;
  plot: { left: number; top: number; right: number; bottom: number };
  ticks: { value: number; y: number }[];
  series: TrendSeriesModel[];
  count: number;
  validPointCount: number;
  max: number;
};

const COLORS = ["#d97846", "#5d91a4", "#7da06c", "#9279a6"];

function numeric(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildTrendChartModel(
  x: unknown[],
  inputs: TrendInputSeries[],
  width = 920,
  height = 300,
): TrendChartModel {
  const count = Math.max(x.length, ...inputs.map((series) => series.values.length), 0);
  const plot = { left: 58, top: 18, right: width - 20, bottom: height - 42 };
  const valid = inputs.flatMap((series) => series.values.map(numeric).filter((value): value is number => value !== undefined));
  if (!count || !valid.length) return { width, height, plot, ticks: [], series: [], count, validPointCount: 0, max: 0 };

  const upper = Math.max(0, ...valid);
  const lower = Math.min(0, ...valid);
  const max = upper === lower ? upper + 1 : upper;
  const plotWidth = Math.max(1, plot.right - plot.left), plotHeight = Math.max(1, plot.bottom - plot.top);
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = max - ((max - lower) * index) / 4;
    return { value, y: plot.bottom - ((value - lower) / (max - lower)) * plotHeight };
  });
  const groupWidth = plotWidth / count;
  const barWidth = Math.max(1, (groupWidth * 0.72) / Math.max(1, inputs.length));
  let validPointCount = 0;
  const series = inputs.map((source, seriesIndex) => {
    const bars: TrendBar[] = [];
    source.values.forEach((raw, index) => {
      if (index >= count) return;
      const value = numeric(raw);
      if (value === undefined) return;
      const y = plot.bottom - ((value - lower) / (max - lower)) * plotHeight;
      validPointCount += 1;
      bars.push({
        index,
        x: plot.left + index * groupWidth + (groupWidth - barWidth * inputs.length) / 2 + seriesIndex * barWidth,
        y,
        width: Math.max(1, barWidth - 1),
        height: Math.max(0, plot.bottom - y),
        value,
        label: String(x[index] ?? index + 1),
      });
    });
    return { name: source.name, color: source.color || COLORS[seriesIndex % COLORS.length], bars };
  });
  return { width, height, plot, ticks, series, count, validPointCount, max };
}

/** Pick evenly spaced x labels so the axis stays readable at any count. */
export function trendAxisLabels(x: unknown[], size = 5): { index: number; text: string }[] {
  if (!x.length) return [];
  return Array.from({ length: size }, (_, index) => {
    const pointIndex = x.length === 1 ? 0 : Math.round((index * (x.length - 1)) / (size - 1));
    return { index: pointIndex, text: String(x[pointIndex]) };
  });
}
