import assert from "node:assert/strict";
import { test } from "node:test";

import { optionalString, requiredString } from "./application/validation.ts";
import { profileNameMaxLength } from "./contracts/profile.ts";

test("shared string validation trims before enforcing its exact length bound", () => {
  const boundary = "ن".repeat(profileNameMaxLength);
  assert.equal(requiredString(` ${boundary} `, "first_name"), boundary);
  assert.equal(optionalString(` ${boundary} `, "first_name"), boundary);
  for (const validate of [requiredString, optionalString]) {
    assert.throws(() => validate(`${boundary}ن`, "first_name"), {
      key: "fieldInvalid",
      kind: "invalid",
      values: { field: "first_name" },
    });
    assert.equal(validate(" ab ", "name", 2), "ab");
    assert.throws(() => validate("abc", "name", 2), { key: "fieldInvalid" });
    assert.equal(validate("😀", "name", 2), "😀");
    assert.throws(() => validate("😀", "name", 1), { key: "fieldInvalid" });
  }
});

test("optional strings preserve omitted/blank patches but reject supplied nonstrings", () => {
  for (const value of [undefined, "", " \n\t "]) {
    assert.equal(optionalString(value, "last_name"), undefined);
  }
  for (const value of [null, false, 0, [], {}]) {
    assert.throws(() => optionalString(value, "last_name"), {
      key: "fieldInvalid",
      kind: "invalid",
      values: { field: "last_name" },
    });
  }
  for (const value of [undefined, null, false, 0, [], {}, " \n\t "]) {
    assert.throws(() => requiredString(value, "first_name"), {
      key: "fieldRequired",
      kind: "invalid",
      values: { field: "first_name" },
    });
  }
});
