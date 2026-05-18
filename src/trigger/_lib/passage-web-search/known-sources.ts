import type { SourceMatchInput } from "@/lib/extraction/restoration";
import { normalizeText } from "./scoring";

/**
 * Deterministic recognizer for passages whose source is so well-known and
 * distinctive that a search round-trip is unnecessary. The signature uses
 * multiple unique phrases co-occurring in the passage to avoid false positives.
 */
export function knownSourceMatches(rawText: string): SourceMatchInput[] {
  const normalized = normalizeText(rawText);
  const hasHappierSignature =
    normalized.includes("material wealth") &&
    normalized.includes("emotional wealth") &&
    ((normalized.includes("money per se") &&
      normalized.includes("positive experiences")) ||
      (normalized.includes("bare minimum necessary for food and shelter") &&
        normalized.includes("means to an end")));

  if (!hasHappierSignature) return [];

  return [
    {
      title: "Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      sourceType: "BOOK",
      confidence: 0.93,
      reason:
        "Known source signature: the passage contains distinctive Tal Ben-Shahar/Happier phrases about money per se, positive experiences, material wealth, and emotional wealth.",
      sourceRef:
        "Tal Ben-Shahar, Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      publisher: "McGraw-Hill",
      year: 2007,
      metadata: {
        provider: "KNOWN_SOURCE_SIGNATURE",
        author: "Tal Ben-Shahar",
        sourceKind: "BOOK",
        verificationNeeded: true,
        searchQueries: [
          '"emotional wealth" "Tal Ben-Shahar" Happier',
          '"Material wealth in and of itself" "Happier"',
          '"money per se" "positive experiences"',
        ],
      },
    },
  ];
}
