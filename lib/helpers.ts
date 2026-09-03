import type { ProbeContext, ProbeResult } from "./types.js";

export function pass(reason: string): ProbeResult {
  return { status: "PASS", reason };
}
export function fail(reason: string): ProbeResult {
  return { status: "FAIL", reason };
}
export function skip(reason: string): ProbeResult {
  return { status: "SKIP", reason };
}

/** Bind `key` to a source serving one row, and confirm it reads back resolved before
 *  the probe proceeds. Returns the confirming read so a probe can double-check the
 *  value if it wants to. Returns `undefined` if the baseline could not be
 *  established — the caller decides whether that is itself a FAIL. */
export async function establishResolved(
  ctx: ProbeContext,
  key: string,
  value: unknown
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const url = ctx.source.urlFor(key, [{ value }]);
  const bound = await ctx.bind(key, url);
  if (!bound.ok) return { ok: false, detail: `bind failed: ${bound.error ?? "unknown error"}` };
  const read = await ctx.readFact(key);
  if (read.state !== "resolved") {
    return { ok: false, detail: `after binding a single row, read reported "${read.rawState ?? read.state}" instead of resolved` };
  }
  return { ok: true };
}

/** Bind `key` to a source serving two disagreeing rows, and confirm it reads back
 *  ambiguous before the probe proceeds. */
export async function establishAmbiguous(
  ctx: ProbeContext,
  key: string,
  valueA: unknown,
  valueB: unknown
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const url = ctx.source.urlFor(key, [{ value: valueA }, { value: valueB }]);
  const bound = await ctx.bind(key, url);
  if (!bound.ok) return { ok: false, detail: `bind failed: ${bound.error ?? "unknown error"}` };
  const read = await ctx.readFact(key);
  if (read.state !== "ambiguous") {
    return { ok: false, detail: `after binding two disagreeing rows, read reported "${read.rawState ?? read.state}" instead of ambiguous` };
  }
  return { ok: true };
}
