import { useMemo, useState } from "react";
import { buildTrendChartModel, trendAxisLabels, type TrendInputSeries } from "./trend-chart";

const numberLabel = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);

export function TrendChart({ x, series, unit, xUnit = "" }: { x: unknown[]; series: TrendInputSeries[]; unit?: unknown; xUnit?: string }) {
  const model = useMemo(() => buildTrendChartModel(x, series), [x, series]);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const labels = useMemo(() => trendAxisLabels(x), [x]);

  if (!model.validPointCount) return <div className="trend-chart-empty">该周期没有可展示的发电数据。</div>;
  return <div className="trend-chart-block">
    <div className="trend-chart-meta"><span>单位：{unit ? String(unit) : "接口未提供"}</span><span>{model.count} 个时间点 · {model.validPointCount} 个有效值</span></div>
    <div className="trend-chart-scroll">
      <svg className="trend-chart-svg" viewBox={`0 0 ${model.width} ${model.height}`} role="img" aria-label="发电量柱状图">
        <g className="chart-grid">{model.ticks.map((tick, index) => <g key={index}><line x1={model.plot.left} x2={model.plot.right} y1={tick.y} y2={tick.y} /><text x={model.plot.left - 8} y={tick.y + 3} textAnchor="end">{numberLabel(tick.value)}</text></g>)}</g>
        <g className="chart-x-labels">{labels.map((label, index) => label && <text key={index} x={model.plot.left + ((label.index + 0.5) / model.count) * (model.plot.right - model.plot.left)} y={model.height - 12} textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}>{`${label.text}${xUnit}`}</text>)}</g>
        <g className="trend-bars">{model.series.flatMap((line) => line.bars.map((bar) => <rect key={`${line.name}-${bar.index}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="1.5" fill={line.color} tabIndex={0} aria-label={`${line.name}，${bar.label}${xUnit}，${numberLabel(bar.value)}${unit ? ` ${String(unit)}` : ""}`} onMouseEnter={() => setHover({ x: bar.x + bar.width / 2, y: bar.y, text: `${bar.label}${xUnit} · ${line.name}：${numberLabel(bar.value)}${unit ? ` ${String(unit)}` : ""}` })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ x: bar.x + bar.width / 2, y: bar.y, text: `${bar.label}${xUnit} · ${line.name}：${numberLabel(bar.value)}${unit ? ` ${String(unit)}` : ""}` })} onBlur={() => setHover(null)} />))}</g>
        {hover && <g className="chart-tooltip" transform={`translate(${Math.min(hover.x + 10, model.width - 190)},${Math.max(hover.y - 34, 4)})`} pointerEvents="none"><rect width="180" height="26" rx="5" /><text x="9" y="18">{hover.text}</text></g>}
      </svg>
    </div>
    {model.series.length > 1 && <div className="trend-chart-legend">{model.series.map((line) => <span key={line.name} className="trend-legend-item"><i style={{ background: line.color }} />{line.name}</span>)}</div>}
  </div>;
}
