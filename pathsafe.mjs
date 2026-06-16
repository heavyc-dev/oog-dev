import { normalize, sep } from "node:path";

/**
 * True only if `child` is `parent` or sits beneath it (boundary-aware, unlike a
 * bare startsWith — "/a/bcd" must NOT count as inside "/a/b"). Used to confine
 * static file serving and phone-driven reads to an allowed root.
 */
export const within = (parent, child) => {
  const p = normalize(parent), c = normalize(child);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
};
