const test = require("node:test");
const assert = require("node:assert/strict");
const { toCsv } = require("./export.cjs");

test("writes the fixed plant fields and quotes CSV values", () => {
  const csv = toCsv([{ id: "PL-1", name: 'Roof, "East"', location: "Hangzhou", capacity: 4.2 }]);
  assert.match(csv, /^"id","name","location","capacity"/);
  assert.match(csv, /"PL-1","Roof, ""East""","Hangzhou","4\.2"/);
  assert.match(csv, /"id","name","location","capacity","today","total","status","efficiency","devices"\r\n/);
});

test("neutralizes spreadsheet formulas including whitespace-prefixed formulas", () => {
  const csv = toCsv([{ id: "=1+1", name: " @SUM(A1:A2)" }]);
  assert.match(csv, /"'=1\+1","' @SUM\(A1:A2\)"/);
});

test("rejects invalid records and non-finite numeric values", () => {
  assert.throws(() => toCsv({}), /list/);
  assert.throws(() => toCsv([null]), /object/);
  assert.throws(() => toCsv([{ capacity: Number.NaN }]), /Invalid number/);
  assert.throws(() => toCsv([{ capacity: { value: 1 } }]), /Invalid value/);
});
