import { test } from "node:test";
import assert from "node:assert/strict";
import { mapTranscriptLine, stripAnsi, encodeCwd } from "../transcript.mjs";

const line = (o) => JSON.stringify(o);

test("user string prompt → user event", () => {
  const ev = mapTranscriptLine(line({ type: "user", message: { role: "user", content: "fix the bug" } }));
  assert.deepEqual(ev, [{ type: "user", text: "fix the bug" }]);
});

test("user array with text → user event", () => {
  const ev = mapTranscriptLine(line({ type: "user", message: { content: [{ type: "text", text: "hello" }] } }));
  assert.deepEqual(ev, [{ type: "user", text: "hello" }]);
});

test("user tool_result → tool_result event (not a user bubble)", () => {
  const ev = mapTranscriptLine(line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: false }] } }));
  assert.deepEqual(ev, [{ type: "tool_result", id: "t1", content: "ok", isError: false }]);
});

test("assistant text + tool_use → two events in order", () => {
  const ev = mapTranscriptLine(line({ type: "assistant", message: { content: [
    { type: "text", text: "running it" },
    { type: "tool_use", id: "u1", name: "Bash", input: { command: "npm test" } },
  ] } }));
  assert.equal(ev.length, 2);
  assert.equal(ev[0].type, "assistant");
  assert.equal(ev[1].type, "tool_use");
  assert.equal(ev[1].name, "Bash");
});

test("tool_result with object content is stringified", () => {
  const ev = mapTranscriptLine(line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "x" }] }] } }));
  assert.equal(typeof ev[0].content, "string");
});

test("summary → summary event", () => {
  assert.deepEqual(mapTranscriptLine(line({ type: "summary", summary: "did stuff" })), [{ type: "summary", text: "did stuff" }]);
});

test("meta / sidechain / garbage → []", () => {
  assert.deepEqual(mapTranscriptLine(line({ type: "user", isMeta: true, message: { content: "x" } })), []);
  assert.deepEqual(mapTranscriptLine(line({ type: "assistant", isSidechain: true, message: { content: [] } })), []);
  assert.deepEqual(mapTranscriptLine("not json {{{"), []);
  assert.deepEqual(mapTranscriptLine(line({ type: "system", subtype: "init" })), []);
});

test("stripAnsi removes escape codes", () => {
  assert.equal(stripAnsi("\u001b[31mred\u001b[0m"), "red");
});

test("encodeCwd maps a windows path", () => {
  // matches Claude Code's own project-dir encoding: every non-alphanumeric -> '-'
  // (incl. the dot in dotfolders like .code, verified against ~/.claude/projects)
  assert.equal(encodeCwd("C:\\Users\\You\\.code\\repo"), "C--Users-You--code-repo");
});
