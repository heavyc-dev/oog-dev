/* transcript.mjs — pure helpers for turning Claude Code's JSONL transcript into chat events.
   Kept dependency-free and side-effect-free so it can be unit tested directly. */

export const ANSI = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
export const stripAnsi = (s) => String(s ?? "").replace(ANSI, "");
export const encodeCwd = (cwd) => String(cwd).replace(/[^a-zA-Z0-9]/g, "-");
const norm = (c) => (typeof c === "string" ? c : JSON.stringify(c));

/**
 * Map one transcript line (raw JSON string) to zero or more UI events.
 * Defensive: unknown/meta/garbage lines yield [].
 */
export function mapTranscriptLine(line) {
  let r;
  try { r = JSON.parse(line); } catch { return []; }
  if (!r || typeof r !== "object" || r.isMeta || r.isSidechain) return [];
  const out = [];
  if (r.type === "user") {
    const c = r.message?.content;
    if (typeof c === "string") { if (c.trim()) out.push({ type: "user", text: c }); }
    else if (Array.isArray(c)) {
      for (const b of c) {
        if (b?.type === "text" && b.text?.trim()) out.push({ type: "user", text: b.text });
        else if (b?.type === "tool_result") out.push({ type: "tool_result", id: b.tool_use_id, content: norm(b.content), isError: !!b.is_error });
      }
    }
  } else if (r.type === "assistant") {
    for (const b of r.message?.content ?? []) {
      if (b?.type === "text") out.push({ type: "assistant", text: b.text });
      else if (b?.type === "tool_use") out.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      else if (b?.type === "thinking") out.push({ type: "thinking", text: b.thinking ?? b.text ?? "" });
    }
  } else if (r.type === "summary" && r.summary) {
    out.push({ type: "summary", text: r.summary });
  }
  return out;
}

/** Is this a human-typed prompt event (vs a tool result that is also role:"user")? */
export const isUserPrompt = (ev) => ev.type === "user" && !!ev.text;
