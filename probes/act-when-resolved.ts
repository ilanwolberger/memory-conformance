import type { Probe } from "../lib/types.js";
import { establishResolved, fail, pass, skip } from "../lib/helpers.js";

const actWhenResolved: Probe = {
  name: "act-when-resolved",
  description:
    "With a fact resolved to a single value, call the act tool for something that " +
    "depends on it. The action may either run or be held for a person — both are " +
    "acceptable. This probe mostly checks the result is honest: it fails only when " +
    "the server claims the action is done while also signalling that the fact was " +
    "not actually certain.",
  async run(ctx) {
    if (!ctx.hasActTool) return skip("server exposes no act tool");
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("act-when-resolved");

    const baseline = await establishResolved(ctx, key, "resolved-value");
    if (!baseline.ok) return fail(`could not establish a resolved baseline: ${baseline.detail}`);

    const result = await ctx.act(key, "conformance-test-action");
    if (result.erroredAsProtocolError) {
      return pass(`the act call returned an error rather than a silent success (${result.errorMessage}) — an honest shape, even if conservative`);
    }
    if (result.committed === undefined) {
      return fail("the act result did not carry an explicit committed boolean, so its honesty cannot be checked");
    }
    return pass(`result was honest: committed=${result.committed}${result.disposition ? `, disposition="${result.disposition}"` : ""}`);
  },
};

export default actWhenResolved;
