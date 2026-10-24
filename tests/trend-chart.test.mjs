import test from "node:test";
import assert from "node:assert/strict";
import { buildTrendChartModel, trendAxisLabels } from "../src/trend-chart.ts";

test("trend chart places one bar per value on a shared baseline", () => {
  const model = buildTrendChartModel(["1", "2", "3"], [{ name: "发电量", values: [10, 20, 30] }]);
  assert.equal(model.count, 3);
  assert.equal(model.validPointCount, 3);
  assert.equal(model.series[0].bars.length, 3);
  assert.equal(model.max, 30);
  const [first, , last] = model.series[0].bars;
  assert.ok(first.x < last.x);
  assert.equal(first.y + first.height, model.plot.bottom);
  assert.ok(last.height > first.height);
  assert.deepEqual(model.series[0].bars.map((bar) => bar.label), ["1", "2", "3"]);
});

test("trend chart groups multiple series side by side without overlapping", () => {
  const model = buildTrendChartModel(["1", "2"], [
    { name: "交流", values: [1, 2] },
    { name: "直流", values: [3, 4] },
  ]);
  const [ac, dc] = model.series;
  assert.ok(dc.bars[0].x > ac.bars[0].x);
  assert.ok(ac.bars[0].x + ac.bars[0].width <= dc.bars[0].x + 0.001);
  assert.equal(model.validPointCount, 4);
  assert.equal(model.max, 4);
});

test("trend chart skips missing values and handles an empty period", () => {
  const gapped = buildTrendChartModel(["1", "2", "3"], [{ name: "收益", values: [5, null, 15] }]);
  assert.equal(gapped.validPointCount, 2);
  assert.equal(gapped.series[0].bars.length, 2);
  assert.deepEqual(gapped.series[0].bars.map((bar) => bar.index), [0, 2]);

  const empty = buildTrendChartModel([], []);
  assert.equal(empty.validPointCount, 0);
  assert.deepEqual(empty.ticks, []);
  assert.deepEqual(empty.series, []);
});

test("trend chart supports decimal units and zero-heavy data", () => {
  const model = buildTrendChartModel(["1", "2", "3"], [{ name: "发电量", values: [0, 0.5, 1.25] }]);
  assert.equal(model.max, 1.25);
  assert.equal(model.series[0].bars[0].height, 0);
  assert.ok(model.ticks.every((tick) => Number.isFinite(tick.value) && Number.isFinite(tick.y)));
});

test("trend axis labels stay evenly spaced for long periods", () => {
  const days = Array.from({ length: 31 }, (_, index) => String(index + 1));
  const labels = trendAxisLabels(days);
  assert.equal(labels.length, 5);
  assert.equal(labels[0].index, 0);
  assert.equal(labels[4].index, 30);
  assert.deepEqual(labels.map((label) => label.text), ["1", "9", "16", "24", "31"]);
  assert.deepEqual(trendAxisLabels([]), []);
});
