import { validateJsonSchema } from "./strict-json-schema.mjs";

const BLOCKS = ["GRAMMAR", "BLANK", "NONFOCUS"];
const GRADES = ["F", "C", "B", "A"];
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export const CALIBRATION_THRESHOLDS = Object.freeze({
  global: Object.freeze({
    blindSolveExactAgreement: [9, 10],
    exactFatalAgreement: [9, 10],
    gwetAc1Fatal: [4, 5],
    fatalSensitivity: [9, 10],
    fatalSpecificity: [17, 20],
    quadraticWeightedKappaGrade: [7, 10],
    focusFieldCompleteness: [1, 1],
    grammarSiteAgreement: [19, 20],
    blankOptionAgreement: [19, 20],
    blankAxisAgreement: [1, 1],
  }),
  block: Object.freeze({
    blindSolveExactAgreement: [7, 8],
    exactFatalAgreement: [7, 8],
    fatalSensitivity: [1, 1],
    fatalSpecificity: [5, 6],
    quadraticWeightedKappaGrade: [3, 5],
    focusFieldCompleteness: [1, 1],
    grammarSiteAgreement: [19, 20],
    blankOptionAgreement: [19, 20],
    blankAxisAgreement: [1, 1],
  }),
});

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

function displayFraction(numerator, denominator, places = 4) {
  const scale = 10 ** places;
  const sign = numerator < 0 ? "-" : "";
  const absolute = Math.abs(numerator);
  let scaled = Math.floor((absolute * scale) / denominator);
  const remainder = (absolute * scale) % denominator;
  if (remainder * 2 >= denominator) scaled += 1;
  const whole = Math.floor(scaled / scale);
  const fraction = String(scaled % scale).padStart(places, "0");
  return `${sign}${whole}.${fraction}`;
}

export function makeMetric(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error("Metric numerator/denominator must be safe integers");
  }
  if (denominator === 0) return null;
  const divisor = gcd(numerator, denominator);
  const normalizedNumerator = denominator < 0 ? -numerator / divisor : numerator / divisor;
  const normalizedDenominator = Math.abs(denominator / divisor);
  return {
    numerator: normalizedNumerator,
    denominator: normalizedDenominator,
    rawValue: normalizedNumerator / normalizedDenominator,
    display4: displayFraction(normalizedNumerator, normalizedDenominator),
  };
}

export function metricMeets(metric, threshold) {
  if (metric === null) return false;
  const [requiredNumerator, requiredDenominator] = threshold;
  return metric.numerator * requiredDenominator >= requiredNumerator * metric.denominator;
}

function confusion(observations) {
  const counts = { TP: 0, TN: 0, FP: 0, FN: 0 };
  for (const row of observations) {
    if (row.goldFatal && row.reviewFatal) counts.TP += 1;
    else if (!row.goldFatal && !row.reviewFatal) counts.TN += 1;
    else if (!row.goldFatal && row.reviewFatal) counts.FP += 1;
    else counts.FN += 1;
  }
  return counts;
}

function qwkFraction(observations) {
  const matrix = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const row of observations) {
    matrix[GRADES.indexOf(row.goldGrade)][GRADES.indexOf(row.reviewGrade)] += 1;
  }
  const goldMargins = matrix.map((row) => row.reduce((sum, count) => sum + count, 0));
  const reviewMargins = Array.from({ length: 4 }, (_, column) =>
    matrix.reduce((sum, row) => sum + row[column], 0),
  );
  let observedRaw = 0;
  let expectedRaw = 0;
  for (let gold = 0; gold < 4; gold += 1) {
    for (let review = 0; review < 4; review += 1) {
      const squaredDistance = (gold - review) ** 2;
      observedRaw += squaredDistance * matrix[gold][review];
      expectedRaw += squaredDistance * goldMargins[gold] * reviewMargins[review];
    }
  }
  return makeMetric(expectedRaw - observedRaw * observations.length, expectedRaw);
}

function metricsFor(observations, includeFocusCompleteness) {
  const counts = confusion(observations);
  const n = observations.length;
  const agreement = counts.TP + counts.TN;
  const positiveMarginalSum = 2 * counts.TP + counts.FP + counts.FN;
  const chanceNumerator = positiveMarginalSum * (2 * n - positiveMarginalSum);
  const ac1Numerator = 2 * agreement * n - chanceNumerator;
  const ac1Denominator = 2 * n * n - chanceNumerator;
  const focusRequired = observations.reduce((sum, row) => sum + (row.focusRequired ?? 0), 0);
  const focusCompleted = observations.reduce((sum, row) => sum + (row.focusCompleted ?? 0), 0);
  const diagnostic = (prefix) => {
    const required = observations.reduce((sum, row) => sum + (row[`${prefix}Required`] ?? 0), 0);
    const correct = observations.reduce((sum, row) => sum + (row[`${prefix}Correct`] ?? 0), 0);
    return { metric: makeMetric(correct, required), counts: { correct, required } };
  };
  const grammarSite = diagnostic("grammarSite");
  const blankOption = diagnostic("blankOption");
  const blankAxis = diagnostic("blankAxis");
  const blindSolveCorrect = observations.filter((row) => row.blindSolveExact === true).length;
  return {
    counts,
    blindSolveExactAgreement: makeMetric(blindSolveCorrect, n),
    blindSolveCounts: { correct: blindSolveCorrect, required: n },
    exactFatalAgreement: makeMetric(agreement, n),
    gwetAc1Fatal: makeMetric(ac1Numerator, ac1Denominator),
    fatalSensitivity: makeMetric(counts.TP, counts.TP + counts.FN),
    fatalSpecificity: makeMetric(counts.TN, counts.TN + counts.FP),
    quadraticWeightedKappaGrade: qwkFraction(observations),
    focusFieldCompleteness: includeFocusCompleteness
      ? makeMetric(focusCompleted, focusRequired)
      : null,
    focusFieldCounts: includeFocusCompleteness
      ? { completed: focusCompleted, required: focusRequired }
      : null,
    grammarSiteAgreement: grammarSite.metric,
    grammarSiteCounts: grammarSite.counts,
    blankOptionAgreement: blankOption.metric,
    blankOptionCounts: blankOption.counts,
    blankAxisAgreement: blankAxis.metric,
    blankAxisCounts: blankAxis.counts,
  };
}

function metricGate(metricSet, thresholds, includeFocusCompleteness, diagnostics = []) {
  const names = [
    "blindSolveExactAgreement",
    "exactFatalAgreement",
    "fatalSensitivity",
    "fatalSpecificity",
    "quadraticWeightedKappaGrade",
  ];
  if (thresholds.gwetAc1Fatal) names.push("gwetAc1Fatal");
  if (includeFocusCompleteness) names.push("focusFieldCompleteness");
  names.push(...diagnostics);
  return names.filter((name) => !metricMeets(metricSet[name], thresholds[name]));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const RFC3339_PATTERN = /^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export function canonicalRfc3339Micros(value) {
  if (typeof value !== "string") return null;
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone, sign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      return null;
    }
    offsetMinutes = (sign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  }
  const parsedMillis = Date.parse(value);
  if (!Number.isFinite(parsedMillis)) return null;
  const wholeSecondMillis =
    Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  const fractionMicros = BigInt(fraction.padEnd(6, "0") || "0");
  const expectedMillis = wholeSecondMillis + Number(fractionMicros / 1000n);
  if (parsedMillis !== expectedMillis) return null;
  return BigInt(wholeSecondMillis) * 1000n + fractionMicros;
}

function canonicalAnswerSet(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowedKeys = ["answerLabels", "answerTextSha256", "disposition"];
  if (
    Object.keys(value).some((key) => !allowedKeys.includes(key)) ||
    !allowedKeys.every((key) => hasOwn(value, key)) ||
    !["ANSWER", "NO_ANSWER", "MULTIPLE", "UNEVALUABLE"].includes(value.disposition) ||
    !Array.isArray(value.answerLabels) ||
    value.answerLabels.length > 100 ||
    value.answerLabels.some((label) => typeof label !== "string" || label.length < 1 || label.length > 80) ||
    new Set(value.answerLabels).size !== value.answerLabels.length ||
    !(value.answerTextSha256 === null || SHA256_PATTERN.test(value.answerTextSha256))
  ) return null;
  const answerLabels = [...value.answerLabels].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const hasAnswer = answerLabels.length > 0 || value.answerTextSha256 !== null;
  if (["NO_ANSWER", "UNEVALUABLE"].includes(value.disposition) && hasAnswer) return null;
  if (["ANSWER", "MULTIPLE"].includes(value.disposition) && !hasAnswer) return null;
  return {
    disposition: value.disposition,
    answerLabels,
    answerTextSha256: value.answerTextSha256,
  };
}

function reviewerBlindAnswerSet(record) {
  return canonicalAnswerSet({
    disposition: record.blindSolve.disposition,
    answerLabels: [
      ...record.blindSolve.answerLabels,
      ...record.blindSolve.alternativeAnswerLabels,
    ].filter((label, index, values) => values.indexOf(label) === index),
    answerTextSha256: record.blindSolve.answerText.sha256,
  });
}

function goldBindingErrors(gold, typeFamily) {
  const errors = [];
  const bindings = gold?.expectedBindings;
  if (
    !bindings ||
    typeof bindings !== "object" ||
    Array.isArray(bindings) ||
    Object.keys(bindings).sort().join("|") !==
      "phaseOneRecordSha256|relabelMapSha256|surfaceSha256|type" ||
    typeof bindings.type !== "string" ||
    !SHA256_PATTERN.test(bindings.surfaceSha256) ||
    !SHA256_PATTERN.test(bindings.relabelMapSha256) ||
    !SHA256_PATTERN.test(bindings.phaseOneRecordSha256)
  ) errors.push("GOLD_EXPECTED_BINDINGS_INVALID");
  else {
    if (typeFamily[bindings.type] !== gold.evidenceFamily) {
      errors.push("GOLD_TYPE_FAMILY_BINDING_INVALID");
    }
    if (
      (gold.block === "GRAMMAR" && bindings.type !== "GRAMMAR_ERROR") ||
      (gold.block === "BLANK" && bindings.type !== "BLANK_INFERENCE") ||
      (gold.block === "NONFOCUS" && ["GRAMMAR_ERROR", "BLANK_INFERENCE"].includes(bindings.type))
    ) errors.push("GOLD_BLOCK_TYPE_BINDING_INVALID");
  }
  if (!Array.isArray(gold?.acceptedAnswerSets) || gold.acceptedAnswerSets.length < 1 || gold.acceptedAnswerSets.length > 100) {
    errors.push("GOLD_ACCEPTED_ANSWER_SETS_INVALID");
  } else {
    const canonical = gold.acceptedAnswerSets.map(canonicalAnswerSet);
    if (canonical.some((row) => row === null)) errors.push("GOLD_ACCEPTED_ANSWER_SETS_INVALID");
    else if (new Set(canonical.map((row) => JSON.stringify(row))).size !== canonical.length) {
      errors.push("GOLD_ACCEPTED_ANSWER_SETS_DUPLICATE");
    }
  }
  return errors;
}

function recordCoherenceErrors(record, typeFamily) {
  const errors = [];
  if (record.evidenceFamily !== typeFamily[record.type]) errors.push("TYPE_FAMILY_MISMATCH");
  const sealedMicros = canonicalRfc3339Micros(record.blindSolve.sealedAt);
  const revealedMicros = canonicalRfc3339Micros(record.revealAudit.revealedAt);
  if (sealedMicros === null) errors.push("BLIND_SOLVE_TIMESTAMP_INVALID");
  if (revealedMicros === null) errors.push("REVEAL_TIMESTAMP_INVALID");
  if (sealedMicros !== null && revealedMicros !== null && revealedMicros <= sealedMicros) {
    errors.push("PHASE_ORDER_INVALID");
  }
  const failedDomain = Object.values(record.validity.domains).some((pass) => !pass);
  if (record.validity.anyFatal !== (failedDomain || record.validity.unresolved)) {
    errors.push("FATAL_AGGREGATE_MISMATCH");
  }
  if (
    record.validity.independentlyDefensibleAnswers.length !==
    record.validity.independentlyDefensibleAnswerCardinality
  ) {
    errors.push("ANSWER_LIST_CARDINALITY_MISMATCH");
  }
  if (record.explanationAudit.allClaimsAccurate !== record.validity.domains.explanationTruth) {
    errors.push("EXPLANATION_AGGREGATE_MISMATCH");
  }
  if (record.type === "GRAMMAR_ERROR") {
    const audit = record.grammarAudit;
    if (audit.markedSites.length !== audit.declaredMarkerCount) errors.push("GRAMMAR_MARKER_AGGREGATE_MISMATCH");
    if (audit.markedSites.filter((site) => site.isKey).length !== audit.declaredAnswerCount) {
      errors.push("GRAMMAR_KEY_AGGREGATE_MISMATCH");
    }
    if (new Set(audit.markedSites.map((site) => site.label)).size !== audit.markedSites.length) {
      errors.push("GRAMMAR_LABEL_DUPLICATE");
    }
    if (
      new Set(audit.markedSites.map((site) => site.pointFamily)).size !== audit.distinctPointFamilies
    ) {
      errors.push("GRAMMAR_FAMILY_AGGREGATE_MISMATCH");
    }
    if (
      audit.allCorrectionsRoundTrip !==
      audit.markedSites.every((site) => site.sourceCorrect && site.correctionRestoresSource)
    ) {
      errors.push("GRAMMAR_CORRECTION_AGGREGATE_MISMATCH");
    }
    if (
      audit.allExplanationsAccurate !== audit.markedSites.every((site) => site.explanationAccurate)
    ) {
      errors.push("GRAMMAR_EXPLANATION_AGGREGATE_MISMATCH");
    }
  }
  if (record.type === "BLANK_INFERENCE") {
    const audit = record.blankAudit;
    if (new Set(audit.options.map((option) => option.label)).size !== audit.options.length) {
      errors.push("BLANK_LABEL_DUPLICATE");
    }
    if (
      audit.allFiveSlotGrammarCompatible !==
      audit.options.every((option) => option.slotGrammarCompatible)
    ) {
      errors.push("BLANK_SEAM_AGGREGATE_MISMATCH");
    }
    if (
      audit.answerPreservesAllAxes !== audit.axisOracle.every((axis) => axis.answerPreserved)
    ) {
      errors.push("BLANK_AXIS_AGGREGATE_MISMATCH");
    }
    const axes = audit.axisOracle.map((axis) => axis.axis);
    if (new Set(axes).size !== 7) errors.push("BLANK_AXIS_SET_INVALID");
  }
  return errors;
}

function deriveFocusDiagnostics(record, gold) {
  const result = {
    focusRequired: 0,
    focusCompleted: 0,
    grammarSiteRequired: 0,
    grammarSiteCorrect: 0,
    blankOptionRequired: 0,
    blankOptionCorrect: 0,
    blankAxisRequired: 0,
    blankAxisCorrect: 0,
  };
  if (gold.block === "GRAMMAR") {
    const fields = [
      "displayedGrammaticality",
      "diagnosis",
      "pointFamily",
      "correctionRestoresSource",
      "explanationAccurate",
    ];
    for (const oracle of gold.grammarOracle ?? []) {
      const site = record?.grammarAudit?.markedSites?.find((candidate) => candidate.label === oracle.label);
      for (const field of fields) {
        result.focusRequired += 1;
        result.grammarSiteRequired += 1;
        if (site && hasOwn(site, field)) {
          result.focusCompleted += 1;
          if (sameJson(site[field], oracle[field])) result.grammarSiteCorrect += 1;
        }
      }
    }
  } else if (gold.block === "BLANK") {
    const optionFields = [
      "slotGrammarCompatible",
      "passageGrounded",
      "primaryIntentAxis",
      "divergentAxes",
      "singleDecisiveFlaw",
    ];
    for (const oracle of gold.blankOracle?.options ?? []) {
      const option = record?.blankAudit?.options?.find((candidate) => candidate.label === oracle.label);
      for (const field of optionFields) {
        result.focusRequired += 1;
        result.blankOptionRequired += 1;
        if (option && hasOwn(option, field)) {
          result.focusCompleted += 1;
          if (sameJson(option[field], oracle[field])) result.blankOptionCorrect += 1;
        }
      }
    }
    for (const oracle of gold.blankOracle?.axes ?? []) {
      const axis = record?.blankAudit?.axisOracle?.find((candidate) => candidate.axis === oracle.axis);
      result.focusRequired += 1;
      result.blankAxisRequired += 1;
      if (axis && hasOwn(axis, "answerPreserved")) {
        result.focusCompleted += 1;
        if (axis.answerPreserved === oracle.answerPreserved) result.blankAxisCorrect += 1;
      }
    }
  }
  return result;
}

function mapCalibrationRows({ reviewRecords, goldItems, recordSchema, typeFamily }) {
  const reasons = [];
  const recordsByItem = new Map();
  for (const record of reviewRecords) {
    const rows = recordsByItem.get(record.itemPseudonym) ?? [];
    rows.push(record);
    recordsByItem.set(record.itemPseudonym, rows);
  }
  const goldIds = new Set(goldItems.map((item) => item.itemId));
  for (const gold of goldItems) {
    for (const code of goldBindingErrors(gold, typeFamily)) reasons.push(`${code}_${gold.itemId}`);
  }
  const validBindingValues = (field) => goldItems
    .map((gold) => gold?.expectedBindings?.[field])
    .filter((value) => typeof value === "string" && SHA256_PATTERN.test(value));
  for (const [field, code] of [
    ["surfaceSha256", "DUPLICATE_GOLD_SURFACE_BINDING"],
    ["phaseOneRecordSha256", "DUPLICATE_GOLD_PHASE1_BINDING"],
  ]) {
    const values = validBindingValues(field);
    if (new Set(values).size !== values.length) reasons.push(code);
  }
  for (const record of reviewRecords) {
    if (!goldIds.has(record.itemPseudonym)) reasons.push(`EXTRA_RECORD_${record.itemPseudonym}`);
  }
  const observations = goldItems.map((gold) => {
    const matches = recordsByItem.get(gold.itemId) ?? [];
    if (matches.length !== 1) reasons.push(`${matches.length === 0 ? "MISSING" : "DUPLICATE"}_RECORD_${gold.itemId}`);
    const record = matches[0];
    let valid = Boolean(record);
    if (record) {
      if (validateJsonSchema(recordSchema, record).length > 0) {
        valid = false;
        reasons.push(`SCHEMA_INVALID_${gold.itemId}`);
      } else {
        for (const code of recordCoherenceErrors(record, typeFamily)) {
          valid = false;
          reasons.push(`${code}_${gold.itemId}`);
        }
        const bindings = gold.expectedBindings;
        if (bindings) {
          if (record.type !== bindings.type) reasons.push(`TYPE_BINDING_MISMATCH_${gold.itemId}`);
          if (record.block !== gold.block) reasons.push(`BLOCK_BINDING_MISMATCH_${gold.itemId}`);
          if (record.evidenceFamily !== gold.evidenceFamily) {
            reasons.push(`EVIDENCE_FAMILY_BINDING_MISMATCH_${gold.itemId}`);
          }
          if (record.surfaceSha256 !== bindings.surfaceSha256) {
            reasons.push(`SURFACE_BINDING_MISMATCH_${gold.itemId}`);
          }
          if (record.relabelMapSha256 !== bindings.relabelMapSha256) {
            reasons.push(`RELABEL_BINDING_MISMATCH_${gold.itemId}`);
          }
          if (record.blindSolve.sealedRecordSha256 !== bindings.phaseOneRecordSha256) {
            reasons.push(`PHASE1_BINDING_MISMATCH_${gold.itemId}`);
          }
        }
      }
    }
    const focus = deriveFocusDiagnostics(record, gold);
    const blindAnswer = record ? reviewerBlindAnswerSet(record) : null;
    const acceptedAnswers = (gold.acceptedAnswerSets ?? []).map(canonicalAnswerSet).filter(Boolean);
    return {
      itemId: gold.itemId,
      block: gold.block,
      evidenceFamily: gold.evidenceFamily,
      goldFatal: gold.goldFatal,
      reviewFatal: record?.validity?.anyFatal,
      goldGrade: gold.goldGrade,
      reviewGrade: record?.grade,
      blindSolveExact:
        blindAnswer !== null && acceptedAnswers.some((accepted) => sameJson(accepted, blindAnswer)),
      complete: valid && focus.focusCompleted === focus.focusRequired,
      recordValid: valid,
      ...focus,
    };
  });
  return { observations, reasons };
}

export function validateGoldComposition(observations) {
  const reasons = [];
  if (observations.length !== 24) reasons.push("GOLD_COUNT_NOT_24");
  if (new Set(observations.map((row) => row.itemId)).size !== observations.length) {
    reasons.push("DUPLICATE_ITEM_ID");
  }
  for (const block of BLOCKS) {
    const rows = observations.filter((row) => row.block === block);
    if (rows.length !== 8) reasons.push(`${block}_COUNT_NOT_8`);
    for (const grade of GRADES) {
      if (rows.filter((row) => row.goldGrade === grade).length !== 2) {
        reasons.push(`${block}_GOLD_GRADE_${grade}_COUNT_NOT_2`);
      }
    }
  }
  if (observations.filter((row) => row.goldFatal).length !== 6) reasons.push("GOLD_FATAL_COUNT_NOT_6");
  for (const grade of GRADES) {
    if (observations.filter((row) => row.goldGrade === grade).length !== 6) {
      reasons.push(`GOLD_GRADE_${grade}_COUNT_NOT_6`);
    }
  }
  if (observations.some((row) => row.goldFatal !== (row.goldGrade === "F"))) {
    reasons.push("GOLD_FATAL_GRADE_INCOHERENT");
  }
  return [...new Set(reasons)].sort();
}

export function scoreCalibrationReviewer(input) {
  const { observations, reasons: mappingReasons } = mapCalibrationRows(input);
  const reasons = [...mappingReasons, ...validateGoldComposition(observations)];
  for (const row of observations) {
    if (row.complete !== true) reasons.push(`INCOMPLETE_${row.itemId}`);
    if (row.recordValid !== true) reasons.push(`INVALID_RECORD_${row.itemId}`);
    if (!BLOCKS.includes(row.block)) reasons.push(`UNKNOWN_BLOCK_${row.itemId}`);
    if (!GRADES.includes(row.goldGrade) || !GRADES.includes(row.reviewGrade)) {
      reasons.push(`UNKNOWN_GRADE_${row.itemId}`);
    }
    if (typeof row.goldFatal !== "boolean" || typeof row.reviewFatal !== "boolean") {
      reasons.push(`MISSING_FATAL_LABEL_${row.itemId}`);
    }
    if (row.block !== "NONFOCUS") {
      if (!Number.isInteger(row.focusRequired) || row.focusRequired <= 0) {
        reasons.push(`FOCUS_DENOMINATOR_INVALID_${row.itemId}`);
      }
      if (
        !Number.isInteger(row.focusCompleted) ||
        row.focusCompleted < 0 ||
        row.focusCompleted > row.focusRequired
      ) {
        reasons.push(`FOCUS_NUMERATOR_INVALID_${row.itemId}`);
      }
    } else if (row.focusRequired !== 0 || row.focusCompleted !== 0) {
      reasons.push(`NONFOCUS_FOCUS_COUNT_NONZERO_${row.itemId}`);
    }
  }
  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length > 0) {
    return {
      decision: "FAIL_INCOMPLETE",
      reasonCodes: uniqueReasons,
      metrics: null,
      comparisonRule: "RAW_INTEGER_FRACTIONS_NO_ROUNDING",
    };
  }

  const global = metricsFor(observations, true);
  const blocks = Object.fromEntries(
    BLOCKS.map((block) => [
      block,
      metricsFor(
        observations.filter((row) => row.block === block),
        block !== "NONFOCUS",
      ),
    ]),
  );
  const failures = metricGate(global, CALIBRATION_THRESHOLDS.global, true, [
    "grammarSiteAgreement",
    "blankOptionAgreement",
    "blankAxisAgreement",
  ]).map(
    (name) => `GLOBAL_${name.toUpperCase()}_BELOW_THRESHOLD`,
  );
  for (const block of BLOCKS) {
    failures.push(
      ...metricGate(
        blocks[block],
        CALIBRATION_THRESHOLDS.block,
        block !== "NONFOCUS",
        block === "GRAMMAR"
          ? ["grammarSiteAgreement"]
          : block === "BLANK"
            ? ["blankOptionAgreement", "blankAxisAgreement"]
            : [],
      ).map((name) => `${block}_${name.toUpperCase()}_BELOW_THRESHOLD`),
    );
  }
  return {
    decision: failures.length === 0 ? "PASS" : "FAIL_METRICS",
    reasonCodes: failures.sort(),
    metrics: { global, blocks },
    comparisonRule: "RAW_INTEGER_FRACTIONS_NO_ROUNDING",
  };
}
