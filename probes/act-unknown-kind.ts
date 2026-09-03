import type { Probe } from "../lib/types.js";
import { establishResolved, fail, pass, skip } from "../lib/helpers.js";

const actUnknownKind: Probe = {
  name: "act-unknown-kind",
  description:
    "Even with a fact resolved, call the act tool with an action name the server " +
    "was never told about. It must not run an action it does not recognize.",
  async run(ctx) {
    if (!ctx.hasActTool) return skip("server exposes no act tool");
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("act-unknown-kind");

    const baseline = await establishResolved(ctx, key, "resolved-value");
    if (!baseline.ok) return fail(`could not establish a resolved baseline: ${baseline.detail}`);

    const unknownKind = `conformance-unrecognized-kind-${Math.random().toString(36).slice(2, 8)}`;
    const result = await ctx.act(key, unknownKind);

    if (result.erroredAsProtocolError) {
      return pass(`the act call was refused for an unrecognized kind (${result.errorMessage})`);
    }
    if (result.committed === undefined) {
      return fail("the act result did not carry an explicit committed boolean, so honesty cannot be checked");
    }
    if (result.committed) {
      return fail("an action of a kind the server was never told about was reported as committed");
    }
    return pass("an action of an unrecognized kind was not committed");
  },
};

export default actUnknownKind;
