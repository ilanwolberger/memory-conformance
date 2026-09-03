import type { Probe } from "../lib/types.js";
import { fail, pass, skip } from "../lib/helpers.js";

const noTimer: Probe = {
  name: "no-timer",
  description:
    "Read a key twice with a source change in between, with no wait between the two " +
    "reads at all. The change must already be visible on the very next read — a " +
    "server that only picks up changes after some polling interval would lag here, " +
    "and this probe gives it no time to catch up.",
  async run(ctx) {
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("no-timer");

    const url = ctx.source.urlFor(key, [{ value: "before" }]);
    const bound = await ctx.bind(key, url);
    if (!bound.ok) return fail(`bind failed: ${bound.error ?? "unknown error"}`);

    const read1 = await ctx.readFact(key);
    if (read1.state !== "resolved" || read1.value !== "before") {
      return fail(`expected the first read to resolve to "before"; got state "${read1.rawState ?? read1.state}", value ${JSON.stringify(read1.value)}`);
    }

    // No delay of any kind here — the point is that a poller with a lag would fail.
    ctx.source.setRows(key, [{ value: "after" }]);
    const read2 = await ctx.readFact(key);

    if (read2.state !== "resolved" || read2.value !== "after") {
      return fail(`the immediately-following read still reported state "${read2.rawState ?? read2.state}", value ${JSON.stringify(read2.value)} instead of "after"`);
    }
    return pass("the change was visible on the very next read, with no wait");
  },
};

export default noTimer;
