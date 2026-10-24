import test from "node:test";
import assert from "node:assert/strict";
import {
  demo,
  plants,
  summary,
  validateEmail,
  validatePassword,
} from "../src/data.ts";

test("accepts ordinary email account formats", () => {
  assert.equal(validateEmail("demo@example.com"), true);
  assert.equal(validateEmail(" person@solar.cn "), true);
});

test("rejects malformed email addresses", () => {
  for (const value of ["", "no-at.example.com", "a@b", "a b@c.com"]) {
    assert.equal(validateEmail(value), false);
  }
});

test("requires an 8–32 character password with letters and digits", () => {
  assert.equal(validatePassword(demo.password), true);
  assert.equal(validatePassword("abcdefgh"), false);
  assert.equal(validatePassword("12345678"), false);
  assert.equal(validatePassword("abc1234"), false);
  assert.equal(validatePassword("a".repeat(33) + "1"), false);
});

test("sample plants have unique IDs and bounded efficiency values", () => {
  assert.equal(new Set(plants.map((plant) => plant.id)).size, plants.length);
  for (const plant of plants) {
    assert.ok(plant.efficiency >= 0 && plant.efficiency <= 100);
  }
  assert.ok(summary.total > summary.today);
});
