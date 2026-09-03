import type { CanonicalState, NormalizedAct, NormalizedCandidate, NormalizedRead, StateMap } from "./types.js";

export const DEFAULT_STATE_MAP: StateMap = {
  fields: ["state", "status"],
  resolved: "resolved",
  ambiguous: "ambiguous",
  unavailable: "unavailable",
};

/** Parse a `--state-map` spec of the form `field=state,resolved=ok,ambiguous=conflict,
 *  unavailable=missing`. Any key omitted keeps the default. `field` may list several
 *  candidate names separated by `|` (e.g. `field=state|status`). */
export function parseStateMap(spec: string | undefined): StateMap {
  const map: StateMap = { ...DEFAULT_STATE_MAP };
  if (!spec) return map;
  for (const pair of spec.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!key || !value) continue;
    if (key === "field") map.fields = value.split("|").map((s) => s.trim()).filter(Boolean);
    else if (key === "resolved") map.resolved = value;
    else if (key === "ambiguous") map.ambiguous = value;
    else if (key === "unavailable") map.unavailable = value;
  }
  return map;
}

/** The shape a CallToolResult takes in the SDK — kept minimal and structural so this
 *  file needs no import from the SDK's own types. */
export interface RawToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}

/** Pull the payload out of an MCP tool result: prefer `structuredContent`, else parse
 *  the first text block as JSON, else fall back to the raw text (a bare value — which
 *  is itself a shape probes can catch). Returns `undefined` if nothing usable is there. */
export function extractPayload(result: RawToolResult): unknown {
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent;
  }
  const textBlock = (result.content ?? []).find((b) => b.type === "text" && typeof b.text === "string");
  if (!textBlock?.text) return undefined;
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return textBlock.text; // bare string — no envelope at all
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mapCanonicalState(rawState: string | undefined, map: StateMap): CanonicalState {
  if (rawState === undefined) return "unknown";
  const s = rawState.toLowerCase();
  if (s === map.resolved.toLowerCase()) return "resolved";
  if (s === map.ambiguous.toLowerCase()) return "ambiguous";
  if (s === map.unavailable.toLowerCase()) return "unavailable";
  return "unknown";
}

function normalizeCandidates(raw: unknown): NormalizedCandidate[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((item) => {
    if (isPlainObject(item) && "value" in item) {
      const confidence = typeof item.confidence === "number" ? item.confidence : undefined;
      return { value: item.value, confidence };
    }
    return { value: item };
  });
}

export function normalizeRead(
  result: RawToolResult,
  map: StateMap,
  callError?: unknown
): NormalizedRead {
  if (callError !== undefined) {
    return {
      raw: undefined,
      rawState: undefined,
      state: "unknown",
      value: undefined,
      candidates: undefined,
      reason: undefined,
      erroredAsProtocolError: true,
      errorMessage: callError instanceof Error ? callError.message : String(callError),
    };
  }
  const payload = extractPayload(result);
  if (result.isError) {
    const textBlock = (result.content ?? []).find((b) => b.type === "text");
    return {
      raw: payload,
      rawState: undefined,
      state: "unknown",
      value: undefined,
      candidates: undefined,
      reason: undefined,
      erroredAsProtocolError: true,
      errorMessage: textBlock?.text ?? "tool call returned an error",
    };
  }
  if (!isPlainObject(payload)) {
    // A bare value (string/number/etc.) or nothing at all — no envelope, no state.
    return {
      raw: payload,
      rawState: undefined,
      state: "unknown",
      value: payload,
      candidates: undefined,
      reason: undefined,
      erroredAsProtocolError: false,
      errorMessage: undefined,
    };
  }
  const field = map.fields.find((f) => typeof payload[f] === "string");
  const rawState = field ? (payload[field] as string) : undefined;
  return {
    raw: payload,
    rawState,
    state: mapCanonicalState(rawState, map),
    value: "value" in payload ? payload.value : payload["result"],
    candidates: normalizeCandidates(payload["candidates"]),
    reason: typeof payload["reason"] === "string" ? (payload["reason"] as string) : undefined,
    erroredAsProtocolError: false,
    errorMessage: undefined,
  };
}

export function normalizeAct(result: RawToolResult, callError?: unknown): NormalizedAct {
  if (callError !== undefined) {
    return {
      raw: undefined,
      committed: undefined,
      disposition: undefined,
      reason: undefined,
      erroredAsProtocolError: true,
      errorMessage: callError instanceof Error ? callError.message : String(callError),
    };
  }
  const payload = extractPayload(result);
  if (result.isError) {
    const textBlock = (result.content ?? []).find((b) => b.type === "text");
    return {
      raw: payload,
      committed: undefined,
      disposition: undefined,
      reason: undefined,
      erroredAsProtocolError: true,
      errorMessage: textBlock?.text ?? "tool call returned an error",
    };
  }
  if (!isPlainObject(payload)) {
    return {
      raw: payload,
      committed: undefined,
      disposition: undefined,
      reason: undefined,
      erroredAsProtocolError: false,
      errorMessage: undefined,
    };
  }
  return {
    raw: payload,
    committed: typeof payload["committed"] === "boolean" ? (payload["committed"] as boolean) : undefined,
    disposition: typeof payload["disposition"] === "string" ? (payload["disposition"] as string) : undefined,
    reason: typeof payload["reason"] === "string" ? (payload["reason"] as string) : undefined,
    erroredAsProtocolError: false,
    errorMessage: undefined,
  };
}
