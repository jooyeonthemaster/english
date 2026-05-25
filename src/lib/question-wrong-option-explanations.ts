import { z } from "zod";

const aiWrongOptionExplanationItemSchema = z.object({
  label: z.string().describe("The label of one wrong option."),
  explanation: z
    .string()
    .min(12)
    .describe(
      "Concise Korean explanation of why this wrong option is tempting and why the passage makes it wrong.",
    ),
});

export function buildAiWrongOptionExplanationsSchema(wrongOptionCount: number) {
  const count = Math.max(0, Math.round(wrongOptionCount));
  return z
    .array(aiWrongOptionExplanationItemSchema)
    .length(count)
    .describe(
      `Exactly ${count} wrong-option explanations, one per wrong option. Do not include the correct option.`,
    );
}

export const aiWrongOptionExplanationsSchema =
  buildAiWrongOptionExplanationsSchema(4);

export function normalizeWrongOptionExplanations(
  value: unknown,
): unknown {
  if (!Array.isArray(value)) return value;

  const normalized: Record<string, string> = {};
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = normalizeString(record.label);
    const explanation = normalizeString(record.explanation);
    if (label && explanation) normalized[label] = explanation;
  }
  return normalized;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
