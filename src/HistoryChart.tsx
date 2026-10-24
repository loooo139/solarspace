import { useMemo, useState } from "react";
import { buildHistoryChartModel, formatChartTime, type ChartInputSeries } from "./history-chart";

const numberLabel = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);

export function HistoryChart({ x, series, unit }: { x: unknown[]; series: ChartInputSeries[]; unit?: unknown }) {
  const model = useMemo(() => buildHistoryChartModel(x, series), [x, series]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number; time: string; value: string; name: string } | null>(null);
  const visibleSeries = model.series.filter((line) => !hidden.includes(line.name));
  const xLabels = Array.from({ length: 5 }, (_, index) => {
    if (!model.count) return null;
    const pointIndex = model.count === 1 ? 0 : Math.round(index * (model.count - 1) / 4);
    return { index: pointIndex, text: formatChartTime(x[pointIndex], pointIndex) };
  });

  if (!model.validPointCount) return <div className="history-chart-empty">该指标没有可绘制的数值点。</div>;
  return <div className="history-chart-block">
    <div className="history-chart-meta"><span>单位：{unit ? String(unit) : "接口未提供"}</span><span>{model.count} 个时间点 · {model.validPointCount} 个有效值</span></div>
    <div className="history-chart-scroll">
      <svg className="history-chart-svg" viewBox={`0 0 ${model.width} ${model.height}`} role="img" aria-label="历史曲线折线图">
        <g className="chart-grid">{model.ticks.map((tick, index) => <g key={index}><line x1={model.plot.left} x2={model.plot.right} y1={tick.y} y2={tick.y} /><text x={model.plot.left - 8} y={tick.y + 3} textAnchor="end">{numberLabel(tick.value)}</text></g>)}</g>
        <g className="chart-x-labels">{xLabels.map((label, index) => label && <text key={index} x={model.count === 1 ? (model.plot.left + model.plot.right) / 2 : model.plot.left + (label.index / (model.count - 1)) * (model.plot.right - model.plot.left)} y={model.height - 12} textAnchor={index === 0 ? "start" : index === xLabels.length - 1 ? "end" : "middle"}>{label.text}</text>)}</g>
        <g className="chart-lines">{visibleSeries.map((line) => <path key={line.name} d={line.path} fill="none" stroke={line.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}</g>
        <g className="chart-points">{visibleSeries.flatMap((line) => line.points.map((point) => <circle key={`${line.name}-${point.index}`} cx={point.x} cy={point.y} r="3" fill={line.color} tabIndex={0} aria-label={`${line.name}，${formatChartTime(point.time, point.index)}，${numberLabel(point.value)}${unit ? ` ${String(unit)}` : ""}`} onMouseEnter={() => setHover({ x: point.x, y: point.y, time: formatChartTime(point.time, point.index), value: numberLabel(point.value), name: line.name })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ x: point.x, y: point.y, time: formatChartTime(point.time, point.index), value: numberLabel(point.value), name: line.name })} onBlur={() => setHover(null)}><title>{`${line.name} · ${formatChartTime(point.time, point.index)} · ${numberLabel(point.value)}${unit ? ` ${String(unit)}` : ""}`}</title></circle>))}</g>
        {hover && <g className="chart-tooltip" transform={`translate(${Math.min(hover.x + 12, model.width - 190)},${Math.max(hover.y - 58, 4)})`} pointerEvents="none"><rect width="180" height="48" rx="5" /><text x="9" y="17">{hover.time}</text><text x="9" y="36">{hover.name}：{hover.value}{unit ? ` ${String(unit)}` : ""}</text></g>}
      </svg>
    </div>
    <div className="history-chart-legend">{model.series.map((line) => <button key={line.name} className={hidden.includes(line.name) ? "chart-legend-item is-hidden" : "chart-legend-item"} aria-pressed={!hidden.includes(line.name)} onClick={() => setHidden((current) => current.includes(line.name) ? current.filter((name) => name !== line.name) : [...current, line.name])}><i style={{ background: line.color }} />{line.name}</button>)}</div>
  </div>;
}
