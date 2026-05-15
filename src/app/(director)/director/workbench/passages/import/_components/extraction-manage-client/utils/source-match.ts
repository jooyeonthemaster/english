import type { SourceMatchDisplay } from "../types";

export function inferKnownSourceFromRaw(rawText: string): SourceMatchDisplay | null {
  const normalized = rawText.toLowerCase();
  if (
    normalized.includes("material wealth") &&
    normalized.includes("emotional wealth") &&
    ((normalized.includes("money per se") &&
      normalized.includes("positive experiences")) ||
      (normalized.includes("bare minimum necessary for food and shelter") &&
        normalized.includes("means to an end")))
  ) {
    return {
      title: "Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      sourceRef:
        "Tal Ben-Shahar, Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      confidence: 0.93,
      method: "KNOWN_SOURCE_SIGNATURE",
      selected: false,
      publisher: "McGraw-Hill",
      year: 2007,
    };
  }
  return null;
}
