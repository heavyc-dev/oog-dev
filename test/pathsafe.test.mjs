import { test } from "node:test";
import assert from "node:assert/strict";
import { join, sep } from "node:path";
import { within } from "../pathsafe.mjs";

const ROOT = join(sep, "srv", "cave");

test("a path equal to the root is inside it", () => {
  assert.equal(within(ROOT, ROOT), true);
});

test("a file directly under the root is inside it", () => {
  assert.equal(within(ROOT, join(ROOT, "file.txt")), true);
});

test("a nested path under the root is inside it", () => {
  assert.equal(within(ROOT, join(ROOT, "a", "b", "c.ts")), true);
});

test("a parent of the root is NOT inside it", () => {
  assert.equal(within(ROOT, join(sep, "srv")), false);
});

test("a traversal escape is NOT inside the root", () => {
  assert.equal(within(ROOT, join(ROOT, "..", "..", "etc", "passwd")), false);
});

test("a sibling sharing a name prefix is NOT inside the root", () => {
  // classic bare-startsWith bug: "/srv/cave-evil" must not count as inside "/srv/cave"
  assert.equal(within(ROOT, ROOT + "-evil"), false);
});

test("an unrelated absolute path is NOT inside the root", () => {
  assert.equal(within(ROOT, join(sep, "tmp", "x")), false);
});

test("a trailing separator on the root still confines correctly", () => {
  assert.equal(within(ROOT + sep, join(ROOT, "f")), true);
  assert.equal(within(ROOT + sep, ROOT + "-evil"), false);
});
