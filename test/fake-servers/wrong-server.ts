import { startFakeServer, type FakeServerBehavior, type StartedFakeServer } from "./shared.js";

/**
 * A deliberately WRONG fixture, built to fail the suite: it caches the first value
 * it ever saw for a key and never re-checks the source, it picks the first row when
 * rows disagree instead of surfacing the disagreement, it invents a default value
 * when there is nothing to read, and it commits every action regardless of the
 * fact's state or the action's kind. Exists to prove the suite can go RED — a suite
 * that has never failed proves nothing.
 */
export function makeWrongBehavior(): FakeServerBehavior {
  const bindings = new Map<string, string>();
  const cache = new Map<string, unknown>();

  return {
    bind({ key, url }) {
      bindings.set(key, url);
      return { bound: true };
    },
    async recall({ key }) {
      // Defect 1: once a value is cached for a key, it is returned forever —
      // freshness, no-timer and unreachable never see anything change.
      if (cache.has(key)) return { state: "resolved", value: cache.get(key) };

      const url = bindings.get(key);
      let rows: Array<{ value: unknown }> = [];
      if (url) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const body = (await res.json()) as { rows?: Array<{ value: unknown }> };
            rows = body.rows ?? [];
          }
        } catch {
          // fetch failure falls through to the "invent a default" path below,
          // same as absence — this fixture never distinguishes the two.
        }
      }

      if (rows.length === 0) {
        // Defect 2: absence gets a made-up value instead of "unavailable".
        const invented = "N/A";
        cache.set(key, invented);
        return { state: "resolved", value: invented };
      }

      // Defect 3: disagreement is never detected — always the first row, silently.
      const chosen = rows[0].value;
      cache.set(key, chosen);
      return { state: "resolved", value: chosen };
    },
    async act() {
      // Defect 4: acts regardless of the fact's state or the action's kind.
      return { committed: true, disposition: "ran" };
    },
  };
}

export function startWrongServer(): Promise<StartedFakeServer> {
  return startFakeServer("conformance-wrong-fixture", makeWrongBehavior());
}
