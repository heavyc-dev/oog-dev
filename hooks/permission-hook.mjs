#!/usr/bin/env node
/* permission-hook.mjs — Claude Code PreToolUse hook.
 *
 * Claude Code runs this before a tool call, passing JSON on stdin. We forward the
 * request to the local bridge (which asks your phone), block for the decision, and
 * emit a PreToolUse decision. If the bridge is unreachable or anything goes wrong we
 * emit "ask" so Claude falls back to its normal in-terminal prompt (safe default).
 *
 * The bridge injects CC_BRIDGE_SESSION and CC_BRIDGE_PORT into the environment.
 */
function emit(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason || "" },
  }));
  process.exit(0);
}

async function main() {
  const session = process.env.CC_BRIDGE_SESSION;
  const port = process.env.CC_BRIDGE_PORT;
  if (!session || !port) return emit("ask", "bridge env not set");

  let raw = "";
  for await (const c of process.stdin) raw += c;
  let payload = {};
  try { payload = JSON.parse(raw || "{}"); } catch {}

  const body = JSON.stringify({
    sessionId: session,
    tool: payload.tool_name ?? payload.toolName ?? "tool",
    input: payload.tool_input ?? payload.toolInput ?? {},
  });

  try {
    const res = await fetch(`http://127.0.0.1:${port}/hook/permission`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!res.ok) return emit("ask", "bridge said " + res.status);
    const out = await res.json().catch(() => ({}));
    if (out.decision === "allow") return emit("allow", "approved from phone");
    if (out.decision === "deny") return emit("deny", out.reason || "denied from phone");
    return emit("ask", "no decision");
  } catch {
    return emit("ask", "bridge unreachable");
  }
}
main();
