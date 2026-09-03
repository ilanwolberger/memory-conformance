#!/usr/bin/env -S npx tsx
import { parseArgs, printHelp } from "./lib/args.js";
import { parseStateMap } from "./lib/normalize.js";
import { connectTarget } from "./lib/mcp-client.js";
import { ControllableSource } from "./lib/source-server.js";
import { ALL_PROBES } from "./probes/index.js";
import { printTable, toJson, type ProbeReportEntry } from "./lib/report.js";
import type { ProbeContext } from "./lib/types.js";

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const stateMap = parseStateMap(args.stateMapSpec);
  const source = new ControllableSource(args.sourcePort, args.sourceUrl);
  await source.start();

  let target;
  try {
    target = await connectTarget({
      url: args.url,
      headers: args.headers,
      toolNames: { read: args.readTool, act: args.actTool, bind: args.bindTool },
      stateMap,
    });
  } catch (err) {
    console.error(`could not connect to ${args.url}: ${err instanceof Error ? err.message : String(err)}`);
    await source.stop();
    return 2;
  }

  if (!target.hasReadTool) {
    console.error(`the server at ${args.url} exposes no tool named "${args.readTool}" (--read-tool) — nothing to test`);
    await target.close();
    await source.stop();
    return 2;
  }
  if (!target.hasActTool) {
    console.error(`note: no tool named "${args.actTool}" (--act-tool) was found — act-* probes will SKIP`);
  }
  if (!target.hasBindTool) {
    console.error(`note: no tool named "${args.bindTool}" (--bind-tool) was found — source-dependent probes will SKIP`);
  }

  let counter = 0;
  const runPrefix = `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const ctx: ProbeContext = {
    hasReadTool: target.hasReadTool,
    hasActTool: target.hasActTool,
    hasBindTool: target.hasBindTool,
    timeoutMs: args.timeoutMs,
    freshKey: (label) => `${runPrefix}-${label}-${counter++}`,
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

  const probesToRun = args.only ? ALL_PROBES.filter((p) => args.only!.includes(p.name)) : ALL_PROBES;
  const entries: ProbeReportEntry[] = [];
  for (const probe of probesToRun) {
    try {
      const result = await withTimeout(probe.run(ctx), args.timeoutMs * 4, `probe "${probe.name}" timed out`);
      entries.push({ name: probe.name, status: result.status, reason: result.reason });
    } catch (err) {
      entries.push({ name: probe.name, status: "FAIL", reason: `probe threw: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  await target.close();
  await source.stop();

  if (args.json) {
    console.log(toJson(entries));
  } else {
    printTable(entries);
  }

  return entries.some((e) => e.status === "FAIL") ? 1 : 0;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    printHelp();
    process.exit(2);
  });
