import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";

import * as questionSchemasModule from "@/lib/question-ai-schemas-mc";

const questionSchemas = (
  "default" in questionSchemasModule
    ? questionSchemasModule.default
    : questionSchemasModule
) as typeof questionSchemasModule;
const { AI_QUESTION_SCHEMAS, getAiResponseSchema } = questionSchemas;

const ACTIVE_ENGLISH_TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
] as const;

type JsonRecord = Record<string, unknown>;

const repoRoot = process.cwd();
const currentSchemaPath = path.join(repoRoot, "src/lib/question-ai-schemas-mc.ts");
const currentSchemaSource = await readFile(currentSchemaPath, "utf8");
const currentSchemaSourceSha256 = createHash("sha256")
  .update(currentSchemaSource)
  .digest("hex");

function asRecord(value: unknown): JsonRecord {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonRecord;
}

function questionsWireSchema(body: JsonRecord): JsonRecord {
  const responseFormat = asRecord(body.response_format);
  assert.equal(responseFormat.type, "json_schema");
  const jsonSchema = asRecord(responseFormat.json_schema);
  assert.equal(jsonSchema.strict, true);
  const schema = asRecord(jsonSchema.schema);
  const properties = asRecord(schema.properties);
  return asRecord(properties.questions);
}

function openAiResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      id: "zero-network-cardinality-probe",
      model: "google/gemini-3.5-flash",
      object: "chat.completion",
      created: 1,
      choices: [
        {
          message: { role: "assistant", content: JSON.stringify(content) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function captureWire(
  schema: z.ZodType,
  responseObject: unknown,
  requireParameters: boolean,
): Promise<JsonRecord> {
  let captured: JsonRecord | undefined;
  let delegateCalls = 0;
  const provider = createOpenAICompatible({
    baseURL: "https://zero-network.invalid/v1",
    name: "zero-network-cardinality-probe",
    apiKey: "dummy-not-a-secret",
    supportsStructuredOutputs: true,
    ...(requireParameters
      ? {
          transformRequestBody(args) {
            return { ...args, provider: { require_parameters: true } };
          },
        }
      : {}),
    fetch: async (_input, init) => {
      delegateCalls += 1;
      captured = JSON.parse(String(init?.body)) as JsonRecord;
      return openAiResponse(responseObject);
    },
  });

  await generateObject({
    model: provider.chatModel("google/gemini-3.5-flash"),
    schema,
    prompt: "Return the requested JSON object.",
  });
  assert.equal(delegateCalls, 1);
  assert(captured);
  return captured;
}

const currentWire = await captureWire(
  getAiResponseSchema("BLANK_INFERENCE"),
  { questions: [] },
  false,
);
const currentQuestions = questionsWireSchema(currentWire);
assert.equal(currentQuestions.type, "array");
assert.equal("minItems" in currentQuestions, false);
assert.equal("maxItems" in currentQuestions, false);

const registeredTypeCardinality = Object.keys(AI_QUESTION_SCHEMAS).map((type) => {
  const jsonSchema = z.toJSONSchema(getAiResponseSchema(type)) as JsonRecord;
  const properties = asRecord(jsonSchema.properties);
  const questions = asRecord(properties.questions);
  return {
    type,
    minItems: questions.minItems ?? null,
    maxItems: questions.maxItems ?? null,
  };
});
const unboundedRegisteredTypes = registeredTypeCardinality.filter(
  ({ minItems, maxItems }) => minItems === null && maxItems === null,
);
assert.equal(registeredTypeCardinality.length, 64);
assert.equal(unboundedRegisteredTypes.length, registeredTypeCardinality.length);
for (const type of ACTIVE_ENGLISH_TYPES) {
  assert(type in AI_QUESTION_SCHEMAS, `missing active English type ${type}`);
}
const unboundedActiveEnglishTypes = registeredTypeCardinality.filter(
  ({ type, minItems, maxItems }) =>
    ACTIVE_ENGLISH_TYPES.includes(type as (typeof ACTIVE_ENGLISH_TYPES)[number]) &&
    minItems === null &&
    maxItems === null,
);
assert.equal(unboundedActiveEnglishTypes.length, ACTIVE_ENGLISH_TYPES.length);

const itemSchema = z.object({ value: z.string() });
const fixedOneWire = await captureWire(
  z.object({ questions: z.array(itemSchema).length(1) }),
  { questions: [{ value: "one" }] },
  true,
);
const fixedOneQuestions = questionsWireSchema(fixedOneWire);
assert.equal(fixedOneQuestions.minItems, 1);
assert.equal(fixedOneQuestions.maxItems, 1);
assert.deepEqual(fixedOneWire.provider, { require_parameters: true });

const fixedThreeWire = await captureWire(
  z.object({ questions: z.array(itemSchema).length(3) }),
  { questions: [{ value: "one" }, { value: "two" }, { value: "three" }] },
  true,
);
const fixedThreeQuestions = questionsWireSchema(fixedThreeWire);
assert.equal(fixedThreeQuestions.minItems, 3);
assert.equal(fixedThreeQuestions.maxItems, 3);
assert.deepEqual(fixedThreeWire.provider, { require_parameters: true });

const result = {
  schemaVersion: 1,
  mode: "zero-network-sdk-wire-capture",
  externalModelCalls: 0,
  databaseWrites: 0,
  currentProductionWrapper: {
    responseFormat: currentWire.response_format && asRecord(currentWire.response_format).type,
    strict: asRecord(asRecord(currentWire.response_format).json_schema).strict,
    questionsMinItems: currentQuestions.minItems ?? null,
    questionsMaxItems: currentQuestions.maxItems ?? null,
    emptyQuestionsAcceptedByClientSchema: true,
  },
  registryScope: {
    registeredAiTypes: registeredTypeCardinality.length,
    registeredAiTypesWithFixedQuestionCardinality:
      registeredTypeCardinality.length - unboundedRegisteredTypes.length,
    activeEnglishTypes: ACTIVE_ENGLISH_TYPES.length,
    activeEnglishTypesWithFixedQuestionCardinality:
      ACTIVE_ENGLISH_TYPES.length - unboundedActiveEnglishTypes.length,
  },
  fixedCardinalityMechanism: {
    one: {
      minItems: fixedOneQuestions.minItems,
      maxItems: fixedOneQuestions.maxItems,
      requireParameters: asRecord(fixedOneWire.provider).require_parameters,
    },
    three: {
      minItems: fixedThreeQuestions.minItems,
      maxItems: fixedThreeQuestions.maxItems,
      requireParameters: asRecord(fixedThreeWire.provider).require_parameters,
    },
  },
  currentSchemaSourceSha256,
  verdict:
    "MECHANISM_CONFIRMED_ONLY: exact Zod array length and OpenRouter require_parameters survive the SDK wire transform; provider acceptance and production rollout remain unproved.",
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
