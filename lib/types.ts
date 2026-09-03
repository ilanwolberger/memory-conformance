/**
 * Shared types for the conformance suite. Everything here describes an observable
 * RESULT SHAPE — what a caller sees back from a tool call — never a mechanism by
 * which a server might produce it.
 */

/** The three states a read result can honestly report. "unknown" means the runner
 *  could not find any of the mapped state values in the response at all — that is
 *  itself something a probe can fail on. */
export type CanonicalState = "resolved" | "ambiguous" | "unavailable" | "unknown";

/** How to read a server's read-result envelope into the three canonical states.
 *  Lets the suite work against a server that names its field or its values
 *  differently, without knowing anything about how it computed them. */
export interface StateMap {
  /** Field names to check, in order, for the state value. First present wins. */
  fields: string[];
  /** Raw string this server writes for each canonical state (case-insensitive match). */
  resolved: string;
  ambiguous: string;
  unavailable: string;
}

export interface NormalizedCandidate {
  value: unknown;
  confidence?: number;
}

/** A read tool call, normalized to a shape every probe can reason about regardless
 *  of the target server's exact field names. */
export interface NormalizedRead {
  raw: unknown;
  rawState: string | undefined;
  state: CanonicalState;
  value: unknown;
  candidates: NormalizedCandidate[] | undefined;
  reason: string | undefined;
  /** True when the tool call itself errored (protocol-level), rather than
   *  returning a normal result the caller can read. */
  erroredAsProtocolError: boolean;
  errorMessage: string | undefined;
}

/** An act tool call, normalized the same way. The one field every probe relies on
 *  is `committed` — whether the action actually fired. */
export interface NormalizedAct {
  raw: unknown;
  committed: boolean | undefined;
  disposition: string | undefined;
  reason: string | undefined;
  erroredAsProtocolError: boolean;
  errorMessage: string | undefined;
}

export type ProbeVerdict = "PASS" | "FAIL" | "SKIP";

export interface ProbeResult {
  status: ProbeVerdict;
  reason: string;
}

export interface Probe {
  name: string;
  /** One paragraph, behavior language only — what must be true, never how a server
   *  should arrive at it. This text ships in the public suite; read it before
   *  committing to it. */
  description: string;
  run: (ctx: ProbeContext) => Promise<ProbeResult>;
}

/** Everything a probe needs, and nothing about how the target server is built. */
export interface ProbeContext {
  hasReadTool: boolean;
  hasActTool: boolean;
  hasBindTool: boolean;
  timeoutMs: number;

  /** Produce a fresh, probe-scoped key so probes never collide with each other or
   *  with a previous run. */
  freshKey: (label: string) => string;

  /** Call the read tool. `extra` is spread into the call's input alongside `key` —
   *  used only by the confidence-hint probe to see whether extra input can sway
   *  the result. */
  readFact: (key: string, extra?: Record<string, unknown>) => Promise<NormalizedRead>;

  /** Call the act tool. */
  act: (key: string, kind: string) => Promise<NormalizedAct>;

  /** Call the bind tool, pointing `key` at a read-only URL this run controls.
   *  Throws if no bind tool was found — callers must check `hasBindTool` first. */
  bind: (key: string, url: string) => Promise<{ ok: boolean; error?: string }>;

  /** The controllable local source. Every probe that needs specific data behind a
   *  key uses this instead of touching the target server's own storage. */
  source: {
    /** Build the URL that, once bound, serves `rows` for `key`. Registers the rows
     *  as a side effect. */
    urlFor: (key: string, rows: unknown[]) => string;
    /** Change what a previously-registered key serves, in place — same URL,
     *  different content, for freshness-style probes. */
    setRows: (key: string, rows: unknown[]) => void;
    /** Make the endpoint for `key` fail every request until `up` is called. */
    down: (key: string) => void;
    up: (key: string) => void;
  };
}

/** One row a source can serve for a key. A single differing field (`value`) is all
 *  the vocabulary this suite needs — it says nothing about how many rows mean what. */
export interface SourceRow {
  value: unknown;
}
