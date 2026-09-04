import type { Probe } from "../lib/types.js";
import { fail, pass } from "../lib/helpers.js";

const absence: Probe = {
  name: "absence",
  description:
    "Read a key nothing was ever bound to, or that a source reports zero rows for. " +
    "The result must say the fact is unavailable — it must not invent a value.",
  async run(ctx) {
    const key = ctx.freshKey("absence");

    // If a bind tool exists, bind to a source that explicitly serves zero rows —
    // the more direct form of "nothing is here". Otherwise, a key nobody ever
    // bound is itself an honest absence case.
    if (ctx.hasBindTool) {
      const url = await ctx.source.urlFor(key, []);
      const bound = await ctx.bind(key, url);
      if (!bound.ok) return fail(`bind failed: ${bound.error ?? "unknown error"}`);
    }

    const read = await ctx.readFact(key);
    if (read.state !== "unavailable") {
      return fail(`an absent fact produced state "${read.rawState ?? read.state}" with value ${JSON.stringify(read.value)} instead of unavailable`);
    }
    if (read.value !== undefined && read.value !== null) {
      return fail(`an absent fact was reported unavailable but still carried a value: ${JSON.stringify(read.value)}`);
    }
    return pass("an absent fact was reported unavailable with no invented value");
  },
};

export default absence;
