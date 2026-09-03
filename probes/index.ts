import type { Probe } from "../lib/types.js";
import freshness from "./freshness.js";
import ambiguity from "./ambiguity.js";
import agreement from "./agreement.js";
import absence from "./absence.js";
import unreachable from "./unreachable.js";
import confidenceHint from "./confidence-hint.js";
import actUnderAmbiguity from "./act-under-ambiguity.js";
import actUnderAbsence from "./act-under-absence.js";
import actWhenResolved from "./act-when-resolved.js";
import actUnknownKind from "./act-unknown-kind.js";
import noTimer from "./no-timer.js";
import honestShape from "./honest-shape.js";

export const ALL_PROBES: Probe[] = [
  freshness,
  ambiguity,
  agreement,
  absence,
  unreachable,
  confidenceHint,
  actUnderAmbiguity,
  actUnderAbsence,
  actWhenResolved,
  actUnknownKind,
  noTimer,
  honestShape,
];
