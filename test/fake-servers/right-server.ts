import { startFakeServer, type FakeServerBehavior, type StartedFakeServer } from "./shared.js";

/**
 * A deliberately RIGHT fixture: every fact is re-fetched live on every read, every
 * row disagreement is surfaced rather than resolved, absence and unreachability are
 * both reported honestly, and an action only fires for a known kind against a fact
 * that is currently resolved. Exists to prove the suite can go GREEN, not just red.
 */
const KNOWN_KINDS = new Set(["conformance-test-action"]);

interface RecallOutcome {
  state: "resolved" | "ambiguous" | "unavailable";
  value?: unknown;
  candidates?: Array<{ value: unknown; confidence: number }>;
  reason?: string;
}

export function makeRightBehavior(): FakeServerBehavior {
  const bindings = new Map<string, string>();

  async function recallFresh(key: string): Promise<RecallOutcome> {
    const url = bindings.get(key);
    if (!url) return { state: "unavailable", reason: "not_bound" };

    let rows: Array<{ value: unknown }>;
    try {
      const res = await fetch(url);
      if (!res.ok) return { state: "unavailable", reason: "source_unreachable" };
      const body = (await res.json()) as { rows?: Array<{ value: unknown }> };
      rows = body.rows ?? [];
    } catch {
      return { state: "unavailable", reason: "source_unreachable" };
    }

    if (rows.length === 0) return { state: "unavailable", reason: "no_rows" };

    // A fixture, not an implementation: the probes only need a server that
    // answers "resolved" when every row agrees and "ambiguous" with every
    // candidate when they do not. Primitive values, plain equality, no scoring.
    const values: unknown[] = [];
    for (const row of rows) if (!values.includes(row.value)) values.push(row.value);

    if (values.length === 1) return { state: "resolved", value: values[0] };
    return { state: "ambiguous", candidates: values.map((value) => ({ value })) };
  }

  return {
    bind({ key, url }) {
      bindings.set(key, url);
      return { bound: true };
    },
    // Extra input (e.g. a confidence hint) is deliberately never read — the schema
    // may accept it, but nothing here looks at it.
    async recall({ key }) {
      return recallFresh(key);
    },
    async act({ key, kind }) {
      if (!KNOWN_KINDS.has(kind)) {
        return { committed: false, disposition: "held", reason: "unknown_kind" };
      }
      const outcome = await recallFresh(key);
      if (outcome.state !== "resolved") {
        return { committed: false, disposition: "escalated", reason: outcome.state };
      }
      return { committed: true, disposition: "ran" };
    },
  };
}

export function startRightServer(): Promise<StartedFakeServer> {
  return startFakeServer("conformance-right-fixture", makeRightBehavior());
}
