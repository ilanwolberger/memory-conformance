import type { Probe } from "../lib/types.js";
import { establishResolved, fail, pass, skip } from "../lib/helpers.js";

const unreachable: Probe = {
  name: "unreachable",
  description:
    "Bind a key, read it successfully, then make the source unreachable and read it " +
    "again. The second read must say the fact could not be read — it must not fall " +
    "back to returning the value from before the source went down.",
  async run(ctx) {
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("unreachable");

    const baseline = await establishResolved(ctx, key, "before-outage");
    if (!baseline.ok) return fail(`could not establish a resolved baseline: ${baseline.detail}`);

    await ctx.source.down(key);
    const read = await ctx.readFact(key);
    await ctx.source.up(key);

    if (read.state === "resolved" && read.value === "before-outage") {
      return fail("the source was unreachable, but the read returned the last known value as if nothing changed");
    }
    if (read.state !== "unavailable") {
      return fail(`the source was unreachable; expected state "unavailable", got "${read.rawState ?? read.state}" (value ${JSON.stringify(read.value)})`);
    }
    return pass("an unreachable source was reported as unavailable, not as the stale last-known value");
  },
};

export default unreachable;
