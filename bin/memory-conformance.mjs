#!/usr/bin/env node
// Runs the TypeScript entry point directly via tsx, so `npx memory-conformance`
// works from any directory without a build step.
import { register } from "tsx/esm/api";
register();
await import("../run.ts");
