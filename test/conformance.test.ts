import { describe, it, expect, afterEach } from "vitest";
import { connectTarget } from "../lib/mcp-client.js";
import { ControllableSource } from "../lib/source-server.js";
import { DEFAULT_STATE_MAP, normalizeRead } from "../lib/normalize.js";
import { ALL_PROBES } from "../probes/index.js";
import type { ProbeContext, ProbeVerdict } from "../lib/types.js";
import { startRightServer } from "./fake-servers/right-server.js";
import { startWrongServer } from "./fake-servers/wrong-server.js";

interface RunOutcome {
  results: Record<string, { status: ProbeVerdict; reason: string }>;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop()!;
    await fn();
  }
});

async function runSuiteAgainst(start: () => Promise<{ url: string; close: () => Promise<void> }>): Promise<RunOutcome> {
  const fixture = await start();
  cleanups.push(fixture.close);

  const source = new ControllableSource(0, undefined);
  await source.start();
  cleanups.push(() => source.stop());

  const target = await connectTarget({
    url: fixture.url,
    headers: {},
    toolNames: { read: "recall_live_fact", act: "commit_gated_action", bind: "bind_source" },
    stateMap: DEFAULT_STATE_MAP,
  });
  cleanups.push(target.close);

  let counter = 0;
  const prefix = `t-${Date.now().toString(36)}`;
  const ctx: ProbeContext = {
    hasReadTool: target.hasReadTool,
    hasActTool: target.hasActTool,
    hasBindTool: target.hasBindTool,
    timeoutMs: 5000,
    freshKey: (label) => `${prefix}-${label}-${counter++}`,
    readFact: (key, extra) => target.readFact(key, extra),
    act: (key, kind) => target.act(key, kind),
    bind: (key, url) => target.bind(key, url),
    source: {
      urlFor: (key, rows) => source.urlFor(key, rows),
      setRows: (key, rows) => source.setRows(key, rows),
      down: (key) => source.down(key),
      up: (key) => source.up(key),
    },
  };

  const results: RunOutcome["results"] = {};
  for (const probe of ALL_PROBES) {
    const r = await probe.run(ctx);
    results[probe.name] = r;
  }
  return { results };
}

describe("memory-conformance against the RIGHT fixture", () => {
  it("passes every probe", async () => {
    const { results } = await runSuiteAgainst(startRightServer);
    const failures = Object.entries(results).filter(([, r]) => r.status === "FAIL");
    if (failures.length > 0) {
      console.log("Unexpected FAILs against the right fixture:", failures);
    }
    for (const [name, r] of Object.entries(results)) {
      expect(r.status, `${name}: ${r.reason}`).not.toBe("FAIL");
    }
  });
});

describe("memory-conformance against the WRONG fixture", () => {
  it("fails the probes that catch its known defects", async () => {
    const { results } = await runSuiteAgainst(startWrongServer);

    console.log("\nWrong-fixture run (expected to be red):");
    for (const [name, r] of Object.entries(results)) {
      console.log(`  ${name.padEnd(20)} ${r.status.padEnd(4)} ${r.reason}`);
    }

    const expectedToFail = [
      "freshness",
      "ambiguity",
      "absence",
      "unreachable",
      "confidence-hint",
      "act-under-ambiguity",
      "act-under-absence",
      "act-unknown-kind",
      "no-timer",
    ];
    for (const name of expectedToFail) {
      expect(results[name]?.status, `${name}: ${results[name]?.reason}`).toBe("FAIL");
    }

    const failCount = Object.values(results).filter((r) => r.status === "FAIL").length;
    expect(failCount).toBeGreaterThanOrEqual(expectedToFail.length);
  });
});

describe("normalizeRead", () => {
  it("treats a bare value with no envelope as an unknown state, not a silent resolve", () => {
    const normalized = normalizeRead({ content: [{ type: "text", text: JSON.stringify("just-a-string") }] }, DEFAULT_STATE_MAP);
    expect(normalized.state).toBe("unknown");
    expect(normalized.value).toBe("just-a-string");
  });

  it("maps a server's own state values via --state-map equivalents", () => {
    const normalized = normalizeRead(
      { content: [{ type: "text", text: JSON.stringify({ status: "conflict", candidates: [{ value: "a" }, { value: "b" }] }) }] },
      { fields: ["status"], resolved: "ok", ambiguous: "conflict", unavailable: "missing" }
    );
    expect(normalized.state).toBe("ambiguous");
  });
});
