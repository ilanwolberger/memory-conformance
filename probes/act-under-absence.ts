import type { Probe } from "../lib/types.js";
import { fail, pass, skip } from "../lib/helpers.js";

const actUnderAbsence: Probe = {
  name: "act-under-absence",
  description:
    "With a fact that is absent (nothing bound, or the source has nothing for it), " +
    "call the act tool for something that depends on it. It must not report the " +
    "action as done.",
  async run(ctx) {
    if (!ctx.hasActTool) return skip("server exposes no act tool");
    const key = ctx.freshKey("act-under-absence");

    if (ctx.hasBindTool) {
      const url = ctx.source.urlFor(key, []);
      const bound = await ctx.bind(key, url);
      if (!bound.ok) return fail(`bind failed: ${bound.error ?? "unknown error"}`);
    }

    const result = await ctx.act(key, "conformance-test-action");
    if (result.erroredAsProtocolError) {
      return pass(`the act call errored rather than running against an absent fact (${result.errorMessage})`);
    }
    if (result.committed === undefined) {
      return fail("the act result did not carry an explicit committed boolean, so honesty cannot be checked");
    }
    if (result.committed) {
      return fail("the action was reported as committed while the fact it depends on was absent");
    }
    return pass("the action was not committed while the fact was absent");
  },
};

export default actUnderAbsence;
