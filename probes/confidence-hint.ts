import type { Probe } from "../lib/types.js";
import { establishAmbiguous, fail, pass, skip } from "../lib/helpers.js";

const confidenceHint: Probe = {
  name: "confidence-hint",
  description:
    "Read an ambiguous key while passing an extra input on the call that suggests " +
    "certainty (e.g. a confidence value). If the tool's schema accepts the extra " +
    "input at all, it must not turn an ambiguous answer into a single value — a " +
    "caller's assertion of confidence is not evidence.",
  async run(ctx) {
    if (!ctx.hasBindTool) return skip("server exposes no bind tool");
    const key = ctx.freshKey("confidence-hint");

    const baseline = await establishAmbiguous(ctx, key, "candidate-a", "candidate-b");
    if (!baseline.ok) return fail(`could not establish an ambiguous baseline: ${baseline.detail}`);

    const read = await ctx.readFact(key, { confidence: 0.99 });
    if (read.erroredAsProtocolError) {
      return skip(`the tool's schema appears to reject the extra input, so this cannot be tested: ${read.errorMessage}`);
    }
    if (read.state === "resolved") {
      return fail(`passing a confidence hint on an ambiguous fact produced a single resolved value (${JSON.stringify(read.value)}) instead of staying ambiguous`);
    }
    if (read.state !== "ambiguous") {
      return fail(`passing a confidence hint on an ambiguous fact produced state "${read.rawState ?? read.state}" instead of remaining ambiguous`);
    }
    return pass("a confidence hint on the call did not collapse an ambiguous answer into one value");
  },
};

export default confidenceHint;
