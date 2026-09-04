import type { Probe } from "../lib/types.js";
import { fail, pass, skip } from "../lib/helpers.js";

const agreement: Probe = {
  name: "agreement",
  description:
    "Bind a key to a source that returns two rows that agree with each other. The " +
    "read may resolve to that one value — this is a sanity check that ordinary " +
    "agreement still works, not a strict requirement to resolve.",
  async run(ctx) {
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("agreement");
    const url = await ctx.source.urlFor(key, [{ value: "same-value" }, { value: "same-value" }]);
    const bound = await ctx.bind(key, url);
    if (!bound.ok) return fail(`bind failed: ${bound.error ?? "unknown error"}`);

    const read = await ctx.readFact(key);
    if (read.state === "resolved" && read.value === "same-value") {
      return pass("two agreeing rows resolved to the agreed value");
    }
    if (read.state === "ambiguous") {
      const values = new Set((read.candidates ?? []).map((c) => JSON.stringify(c.value)));
      if (values.size === 1 && values.has(JSON.stringify("same-value"))) {
        return pass("two agreeing rows were reported as a single-candidate ambiguous result — acceptable, not a false disagreement");
      }
    }
    return fail(`two agreeing rows produced state "${read.rawState ?? read.state}", value ${JSON.stringify(read.value)}, candidates ${JSON.stringify(read.candidates)} — expected the agreed value`);
  },
};

export default agreement;
