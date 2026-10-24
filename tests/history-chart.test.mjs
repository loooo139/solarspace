import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryChartModel, formatChartTime } from "../src/history-chart.ts";

test("history chart maps every valid value and keeps series names", () => {
  const model = buildHistoryChartModel(["t1", "t2", "t3"], [
    { name: "序列 1", values: [1, 2, 3] },
    { name: "序列 2", values: ["4", "5", "6"] },
  ]);
  assert.equal(model.count, 3);
  assert.equal(model.validPointCount, 6);
  assert.equal(model.series.length, 2);
  assert.equal(model.series[0].name, "序列 1");
  assert.equal(model.series[1].name, "序列 2");
  assert.equal(model.series[0].points.length, 3);
  assert.equal(model.series[1].points[0].value, 4);
  assert.match(model.series[0].path, /^M[\d.]+,[\d.]+ L/);
});

test("history chart breaks the line at missing values instead of interpolating", () => {
  const model = buildHistoryChartModel(["t1", "t2", "t3", "t4"], [
    { name: "电压", values: [10, null, "", 12] },
  ]);
  assert.equal(model.validPointCount, 2);
  assert.equal(model.series[0].points.length, 2);
  assert.equal(model.series[0].path.match(/M/g).length, 2);
  assert.equal(model.series[0].path.match(/L/g), null);
});

test("history chart handles a single point, a flat series, and empty input", () => {
  const single = buildHistoryChartModel(["only"], [{ name: "功率", values: [5] }]);
  assert.equal(single.series[0].points.length, 1);
  assert.equal(single.series[0].points[0].x, (single.plot.left + single.plot.right) / 2);
  assert.ok(single.series[0].points[0].y > single.plot.top);
  assert.ok(single.series[0].points[0].y < single.plot.bottom);

  const flat = buildHistoryChartModel(["a", "b", "c"], [{ name: "温度", values: [7, 7, 7] }]);
  assert.equal(flat.validPointCount, 3);
  assert.ok(flat.ticks.every((tick) => Number.isFinite(tick.value) && Number.isFinite(tick.y)));

  const empty = buildHistoryChartModel([], []);
  assert.equal(empty.validPointCount, 0);
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.ticks, []);
});

test("history chart keeps one x position per time slot for uneven series", () => {
  const model = buildHistoryChartModel(["t1", "t2", "t3", "t4"], [
    { name: "交流", values: [1, 2] },
    { name: "直流", values: [3, 4, 5, 6] },
  ]);
  assert.equal(model.count, 4);
  assert.equal(model.series[0].points.length, 2);
  assert.equal(model.series[1].points.length, 4);
  assert.ok(model.series[0].points[1].x < model.series[1].points[3].x);
});

test("history chart time labels format epoch seconds, milliseconds, and raw labels", () => {
  assert.match(formatChartTime(1700000000, 0), /\d/);
  assert.match(formatChartTime(1700000000000, 0), /\d/);
  assert.equal(formatChartTime("2026-10-24 12:00", 0), "2026-10-24 12:00");
  assert.equal(formatChartTime(undefined, 4), "时间点 5");
  assert.equal(formatChartTime("", 0), "时间点 1");
});
