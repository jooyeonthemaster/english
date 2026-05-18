/**
 * Field-level normalizers shared by cascade and grounded restoration schemas.
 * Each one collapses the many spelling variants the model emits into the
 * canonical enum value the Zod schemas expect.
 */

export function normalizeRestorationStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (status === "SUCCESS" || status === "COMPLETE" || status === "COMPLETED") {
    return "RESTORED";
  }
  if (status === "MATCHED" || status === "ORIGINAL") return "ORIGINAL_MATCHED";
  if (status === "NEEDS_REVIEW" || status === "WARN") return "PARTIAL";
  return status || "PARTIAL";
}

export function normalizeFinalStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "ORIGINAL_MATCHED" ||
    status === "ORIGINAL" ||
    status === "MATCHED" ||
    status === "SUCCESS" ||
    status === "COMPLETE" ||
    status === "COMPLETED"
  ) {
    return "RESTORED";
  }
  if (status === "NEEDS_REVIEW" || status === "WARN") return "PARTIAL";
  if (status === "RESTORED" || status === "PARTIAL" || status === "FAILED") {
    return status;
  }
  return status || "PARTIAL";
}

export function normalizeRestorationMethod(value: unknown): string {
  const method = String(value ?? "").toUpperCase();
  if (
    method === "NONE" ||
    method === "INSUFFICIENT_DATA" ||
    method === "UNSUPPORTED" ||
    method === "FAILURE"
  ) {
    return "FAILED";
  }
  if (method.includes("MIXED") || method.includes("HYBRID") || method.includes("COMBINED")) {
    return "MIXED";
  }
  if (method.includes("SOURCE") && method.includes("QUESTION")) return "MIXED";
  if (
    method.includes("SOURCE") ||
    method.includes("MATCH") ||
    method.includes("ORIGINAL") ||
    method.includes("DATABASE") ||
    method.includes("REFERENCE")
  ) {
    return "SOURCE_MATCH";
  }
  if (
    method.includes("QUESTION") ||
    method.includes("SOLV") ||
    method.includes("PROBLEM") ||
    method.includes("SHEET") ||
    method.includes("OCR") ||
    method.includes("DIRECT") ||
    method.includes("PASSAGE") ||
    method.includes("TEXT") ||
    method.includes("EVIDENCE") ||
    method.includes("INFERENCE") ||
    method.includes("RECONSTRUCT") ||
    method.includes("RESTORATION") ||
    method.includes("LOGICAL") ||
    method.includes("EXTRACT") ||
    method.includes("DIALOGUE") ||
    method.includes("CONTEXT")
  ) {
    return "QUESTION_EVIDENCE";
  }
  // Final safety net — anything else falls back to the most general option so
  // schema validation cannot reject a useful AI restoration just because the
  // model invented its own method label.
  if (
    method !== "SOURCE_MATCH" &&
    method !== "QUESTION_EVIDENCE" &&
    method !== "MIXED" &&
    method !== "FAILED"
  ) {
    return "QUESTION_EVIDENCE";
  }
  return method;
}

export function normalizeVerificationStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "SUCCESS" ||
    status === "OK" ||
    status === "VALID" ||
    status === "VERIFIED" ||
    status === "VERIFIED_WITH_WARNINGS"
  ) {
    return "PASS";
  }
  if (status === "NEEDS_REVISION" || status === "NEEDS_REVIEW") return "WARN";
  return status || "WARN";
}

export function normalizeComparisonRecommendation(value: unknown): string {
  const rec = String(value ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    SOURCE: "SOURCE_PRIMARY",
    USE_SOURCE: "SOURCE_PRIMARY",
    PREFER_SOURCE: "SOURCE_PRIMARY",
    AI: "AI_PRIMARY",
    USE_AI: "AI_PRIMARY",
    PREFER_AI: "AI_PRIMARY",
    AGREE: "BOTH_AGREE",
    BOTH: "BOTH_AGREE",
    REVIEW: "TEACHER_REVIEW_REQUIRED",
    MANUAL: "TEACHER_REVIEW_REQUIRED",
    UNCLEAR: "TEACHER_REVIEW_REQUIRED",
  };
  const normalized = aliases[rec] ?? rec;
  if (
    normalized === "SOURCE_PRIMARY" ||
    normalized === "AI_PRIMARY" ||
    normalized === "BOTH_AGREE" ||
    normalized === "TEACHER_REVIEW_REQUIRED"
  ) {
    return normalized;
  }
  return "TEACHER_REVIEW_REQUIRED";
}

export function normalizeSentenceArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === "string") {
      return { order: index + 1, text: item, status: "RESTORED" };
    }
    if (item && typeof item === "object") {
      return { order: index + 1, ...(item as Record<string, unknown>) };
    }
    return { order: index + 1, text: String(item ?? ""), status: "CHECK" };
  });
}

export function normalizeChangeArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") {
      return {
        before: "",
        after: "",
        reason: item,
        evidenceType: "OTHER",
        confidence: 0.5,
      };
    }
    return item;
  });
}
