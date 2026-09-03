import type { Probe, ProbeContext } from "../lib/types.js";
import { fail, pass } from "../lib/helpers.js";

async function checkOneShape(ctx: ProbeContext, label: string, key: string): Promise<string | undefined> {
  const read = await ctx.readFact(key);
  if (read.erroredAsProtocolError) return undefined; // covered by other probes; not a shape claim here
  if (read.state === "unknown") {
    return `the ${label} case did not carry an explicit state field in {resolved, ambiguous, unavailable} — raw result: ${JSON.stringify(read.raw)}`;
  }
  return undefined;
}

const honestShape: Probe = {
  name: "honest-shape",
  description:
    "Every read result must carry an explicit state — resolved, ambiguous, or " +
    "unavailable (or documented equivalents mapped via --state-map) — never a bare " +
    "value with no indication of which of the three it is.",
  async run(ctx) {
    const problems: string[] = [];

    const absenceKey = ctx.freshKey("honest-shape-absence");
    const absenceProblem = await checkOneShape(ctx, "absent", absenceKey);
    if (absenceProblem) problems.push(absenceProblem);

    if (ctx.hasBindTool) {
      const resolvedKey = ctx.freshKey("honest-shape-resolved");
      const url1 = ctx.source.urlFor(resolvedKey, [{ value: "x" }]);
      const bound1 = await ctx.bind(resolvedKey, url1);
      if (bound1.ok) {
        const problem = await checkOneShape(ctx, "resolved", resolvedKey);
        if (problem) problems.push(problem);
      }

      const ambiguousKey = ctx.freshKey("honest-shape-ambiguous");
      const url2 = ctx.source.urlFor(ambiguousKey, [{ value: "x" }, { value: "y" }]);
      const bound2 = await ctx.bind(ambiguousKey, url2);
      if (bound2.ok) {
        const problem = await checkOneShape(ctx, "ambiguous", ambiguousKey);
        if (problem) problems.push(problem);
      }
    }

    if (problems.length > 0) return fail(problems.join("; "));
    return pass("every read result checked carried an explicit, recognizable state");
  },
};

export default honestShape;
