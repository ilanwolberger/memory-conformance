import type { ProbeVerdict } from "./types.js";

export interface ProbeReportEntry {
  name: string;
  status: ProbeVerdict;
  reason: string;
}

export function printTable(entries: ProbeReportEntry[]): void {
  const nameWidth = Math.max(5, ...entries.map((e) => e.name.length));
  const statusWidth = 4;
  const header = `${"probe".padEnd(nameWidth)}  ${"".padEnd(statusWidth)}  reason`;
  console.log(header);
  console.log("-".repeat(header.length + 20));
  for (const e of entries) {
    console.log(`${e.name.padEnd(nameWidth)}  ${e.status.padEnd(statusWidth)}  ${e.reason}`);
  }
  const pass = entries.filter((e) => e.status === "PASS").length;
  const fail = entries.filter((e) => e.status === "FAIL").length;
  const skip = entries.filter((e) => e.status === "SKIP").length;
  console.log("");
  console.log(`${pass} passed, ${fail} failed, ${skip} skipped (of ${entries.length})`);
}

export function toJson(entries: ProbeReportEntry[]): string {
  const pass = entries.filter((e) => e.status === "PASS").length;
  const fail = entries.filter((e) => e.status === "FAIL").length;
  const skip = entries.filter((e) => e.status === "SKIP").length;
  return JSON.stringify(
    {
      summary: { pass, fail, skip, total: entries.length, ok: fail === 0 },
      probes: entries,
    },
    null,
    2
  );
}
