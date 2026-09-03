import type { Probe } from "../lib/types.js";
import { fail, pass, skip } from "../lib/helpers.js";

const ambiguity: Probe = {
  name: "ambiguity",
  description:
    "Bind a key to a source that returns two rows that disagree. The read must NOT " +
    "settle on a single value — it must report every candidate. Picking one of the " +
    "two, silently or otherwise, fails this probe.",
  async run(ctx) {
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("ambiguity");
    const url = ctx.source.urlFor(key, [{ value: "candidate-a" }, { value: "candidate-b" }]);
    const bound = await ctx.bind(key, url);
    if (!bound.ok) return fail(`bind failed: ${bound.error ?? "unknown error"}`);

    const read = await ctx.readFact(key);
    if (read.state !== "ambiguous") {
      return fail(`two disagreeing rows produced state "${read.rawState ?? read.state}" (value ${JSON.stringify(read.value)}) instead of ambiguous`);
    }
    const values = new Set((read.candidates ?? []).map((c) => JSON.stringify(c.value)));
    if (!values.has(JSON.stringify("candidate-a")) || !values.has(JSON.stringify("candidate-b"))) {
      return fail(`ambiguous result did not carry both disagreeing candidates; got ${JSON.stringify(read.candidates)}`);
    }
    return pass("both disagreeing candidates were reported, and no single value was chosen");
  },
};

export default ambiguity;
