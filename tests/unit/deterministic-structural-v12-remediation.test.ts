import assert from "node:assert/strict";
import test from "node:test";

import {
  RELAXED_BLOCKING_QUALITY_CODES,
  SALVAGE_RELAXABLE_CODES,
} from "../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
import { SHIP_FIRST_WARNING_CODES } from "../../src/lib/question-quality";

const independentlyAdjudicatedFatalCodes = [
  "generic-answer-count",
  "generic-multi-answer-direction",
  "sentence-insert-missing-given",
  "sentence-order-dependent-fragment",
  "sentence-order-paragraph-body-label",
] as const;

test("v12 schema-conforming fatal codes cannot escape relaxed or salvage publication", () => {
  for (const code of independentlyAdjudicatedFatalCodes) {
    assert.equal(
      RELAXED_BLOCKING_QUALITY_CODES.has(code),
      true,
      `${code} must block relaxed publication`,
    );
    assert.equal(
      SALVAGE_RELAXABLE_CODES.has(code),
      false,
      `${code} must not enter salvage publication`,
    );
    assert.equal(
      SHIP_FIRST_WARNING_CODES.has(code),
      false,
      `${code} must not be downgraded to a craft warning`,
    );
  }
});
