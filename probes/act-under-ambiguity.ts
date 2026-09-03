import type { Probe } from "../lib/types.js";
import { establishAmbiguous, fail, pass, skip } from "../lib/helpers.js";

const actUnderAmbiguity: Probe = {
  name: "act-under-ambiguity",
  description:
    "With a fact left ambiguous, call the act tool for something that depends on it. " +
    "It must not report the action as done — an act that depends on an uncertain " +
    "fact must not fire while the fact is uncertain.",
  async run(ctx) {
    if (!ctx.hasActTool) return skip("server exposes no act tool");
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("act-under-ambiguity");

    const baseline = await establishAmbiguous(ctx, key, "candidate-a", "candidate-b");
    if (!baseline.ok) return fail(`could not establish an ambiguous baseline: ${baseline.detail}`);

    const result = await ctx.act(key, "conformance-test-action");
    if (result.erroredAsProtocolError) {
      return pass(`the act call errored rather than running against an ambiguous fact (${result.errorMessage})`);
    }
    if (result.committed === undefined) {
      return fail("the act result did not carry an explicit committed boolean, so honesty cannot be checked");
    }
    if (result.committed) {
      return fail("the action was reported as committed while the fact it depends on was ambiguous");
    }
    return pass("the action was not committed while the fact was ambiguous");
  },
};

export default actUnderAmbiguity;
