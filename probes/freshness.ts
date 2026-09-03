import type { Probe } from "../lib/types.js";
import { fail, pass, skip } from "../lib/helpers.js";

const freshness: Probe = {
  name: "freshness",
  description:
    "Bind a key, read it, change what the source says, then read it again with no delay. " +
    "The second read must reflect the change. A server that answers with the value it " +
    "returned the first time — a cached answer — fails this probe.",
  async run(ctx) {
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("freshness");

    const url = ctx.source.urlFor(key, [{ value: "first-value" }]);
    const bound = await ctx.bind(key, url);
    if (!bound.ok) return fail(`bind failed: ${bound.error ?? "unknown error"}`);

    const read1 = await ctx.readFact(key);
    if (read1.state !== "resolved" || read1.value !== "first-value") {
      return fail(`expected the first read to resolve to "first-value"; got state "${read1.rawState ?? read1.state}", value ${JSON.stringify(read1.value)}`);
    }

    ctx.source.setRows(key, [{ value: "second-value" }]);
    const read2 = await ctx.readFact(key);

    if (read2.state !== "resolved" || read2.value !== "second-value") {
      return fail(`after the source changed, the read still reported state "${read2.rawState ?? read2.state}", value ${JSON.stringify(read2.value)} — expected "second-value"`);
    }
    return pass("the second read reflected the source change immediately");
  },
};

export default freshness;
