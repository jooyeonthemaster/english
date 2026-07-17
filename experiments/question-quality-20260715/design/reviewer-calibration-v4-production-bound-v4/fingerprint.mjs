import { createHash } from "node:crypto";
import { canonicalizeJcs } from "./canonicalize.mjs";

export const FINGERPRINT_DERIVATION_VERSION = "NARA_QCAL_V4_FINGERPRINT_NFKC_WS_ASCII_FOLD_8TOKEN_1";
export const FINGERPRINT_DOMAIN_PREFIX = "NARA-QCAL-V4-FINGERPRINT\u0000";

export const FINGERPRINT_COMPONENT_FIELDS = Object.freeze([
  "normalizedFullTextSha256",
  "hashedEightWordWindowSetSha256",
  "topicTagSetSha256",
  "scenarioEntityTupleSha256",
  "itemAuthorPrincipalSha256",
  "surfaceTemplateFingerprintSha256",
  "compositeFingerprintSha256"
]);

export const FINGERPRINT_INPUT_FIELDS = Object.freeze([
  "fullText",
  "visibleSurface",
  "surfaceTemplate",
  "topicTags",
  "scenarioEntities",
  "authorPrincipalCommitmentSha256",
  "canonicalTypeId",
  "canonicalFamilyId",
  "rotationEpoch"
]);

export const FINGERPRINT_FAMILY_BY_TYPE = Object.freeze({
  BLANK_INFERENCE: null, GRAMMAR_ERROR: null,
  GRAMMAR_CHOICE_COMBO: "NF-F4-GRAMMAR_FORM_DIAGNOSIS",
  VOCAB_CHOICE: "NF-F5-LEXICAL_SEMANTICS",
  SENTENCE_ORDER: "NF-F3-DISCOURSE_STRUCTURE",
  SENTENCE_INSERT: "NF-F3-DISCOURSE_STRUCTURE",
  TOPIC: "NF-F1-GLOBAL_MEANING_SELECTION", MAIN_IDEA: "NF-F1-GLOBAL_MEANING_SELECTION", TITLE: "NF-F1-GLOBAL_MEANING_SELECTION",
  IMPLIED_MEANING: "NF-F2-LOCAL_INFERENCE_AND_REFERENCE", REFERENCE: "NF-F2-LOCAL_INFERENCE_AND_REFERENCE", CONTENT_MATCH: "NF-F2-LOCAL_INFERENCE_AND_REFERENCE",
  SUMMARY_COMPLETE_MC: "NF-F6-SUMMARY_AND_COMPRESSION", IRRELEVANT: "NF-F3-DISCOURSE_STRUCTURE",
  CONDITIONAL_WRITING: "NF-F7-CONTROLLED_REWRITE_AND_ORDER", SENTENCE_TRANSFORM: "NF-F7-CONTROLLED_REWRITE_AND_ORDER",
  FILL_BLANK_KEY: "NF-F8-TARGETED_CONSTRUCTED_EXPRESSION", SUMMARY_COMPLETE: "NF-F6-SUMMARY_AND_COMPRESSION",
  SUMMARY_WRITING: "NF-F6-SUMMARY_AND_COMPRESSION", WORD_ORDER: "NF-F7-CONTROLLED_REWRITE_AND_ORDER",
  TOPIC_SENTENCE_WRITING: "NF-F8-TARGETED_CONSTRUCTED_EXPRESSION", GRAMMAR_CORRECTION: "NF-F4-GRAMMAR_FORM_DIAGNOSIS",
  CONTEXT_MEANING: "NF-F5-LEXICAL_SEMANTICS", SYNONYM: "NF-F5-LEXICAL_SEMANTICS", ANTONYM: "NF-F5-LEXICAL_SEMANTICS"
});

function fail(code, detail = "") {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function assert(condition, code, detail = "") {
  if (!condition) fail(code, detail);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function uint64(value) {
  assert(Number.isSafeInteger(value) && value >= 0, "FP_LENGTH", `${value}`);
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function domainHash(label, valueBytes) {
  const prefix = Buffer.from(FINGERPRINT_DOMAIN_PREFIX, "utf8");
  const version = Buffer.from(FINGERPRINT_DERIVATION_VERSION, "utf8");
  const labelBytes = Buffer.from(label, "utf8");
  const payload = Buffer.isBuffer(valueBytes) ? valueBytes : Buffer.from(valueBytes, "utf8");
  return sha256(Buffer.concat([
    prefix,
    uint64(version.length), version,
    uint64(labelBytes.length), labelBytes,
    uint64(payload.length), payload
  ]));
}

function assertUnicodeScalars(value, label) {
  assert(typeof value === "string", "FP_STRING_REQUIRED", label);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      assert(next >= 0xdc00 && next <= 0xdfff, "FP_LONE_HIGH_SURROGATE", label);
      index += 1;
    } else {
      assert(!(code >= 0xdc00 && code <= 0xdfff), "FP_LONE_LOW_SURROGATE", label);
    }
  }
}

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 32));
}

export function normalizeFingerprintText(value) {
  assertUnicodeScalars(value, "text");
  return asciiLower(value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[\p{White_Space}]+/gu, " ").trim());
}

function normalizeAtom(value, label) {
  assertUnicodeScalars(value, label);
  const normalized = asciiLower(value.normalize("NFKC").replace(/[\p{White_Space}]+/gu, " ").trim());
  assert(normalized.length > 0, "FP_EMPTY_ATOM", label);
  return normalized;
}

function exactKeys(object, expected, code) {
  assert(object && typeof object === "object" && !Array.isArray(object), code);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), code, actual.join(","));
}

function canonicalBytes(value) {
  return Buffer.from(canonicalizeJcs(value), "utf8");
}

function rawUtf8Commitment(label, value) {
  assertUnicodeScalars(value, label);
  return domainHash(`INPUT:${label}`, Buffer.from(value, "utf8"));
}

function normalizeTopicTags(tags) {
  assert(Array.isArray(tags) && tags.length >= 1, "FP_TOPIC_TAGS_REQUIRED");
  const normalized = tags.map((tag, index) => normalizeAtom(tag, `topicTags[${index}]`)).sort();
  assert(new Set(normalized).size === normalized.length, "FP_TOPIC_TAG_COLLISION_AFTER_NORMALIZATION");
  return normalized;
}

function normalizeScenarioEntities(entities) {
  assert(Array.isArray(entities) && entities.length >= 1, "FP_SCENARIO_ENTITIES_REQUIRED");
  const normalized = entities.map((entity, index) => {
    exactKeys(entity, ["entityType", "entityId", "role"], "FP_SCENARIO_ENTITY_FIELDS");
    return {
      entityId: normalizeAtom(entity.entityId, `scenarioEntities[${index}].entityId`),
      entityType: normalizeAtom(entity.entityType, `scenarioEntities[${index}].entityType`),
      role: normalizeAtom(entity.role, `scenarioEntities[${index}].role`)
    };
  });
  normalized.sort((left, right) => {
    const leftBytes = canonicalizeJcs(left);
    const rightBytes = canonicalizeJcs(right);
    return leftBytes < rightBytes ? -1 : leftBytes > rightBytes ? 1 : 0;
  });
  const encoded = normalized.map((entry) => canonicalizeJcs(entry));
  assert(new Set(encoded).size === encoded.length, "FP_SCENARIO_ENTITY_COLLISION_AFTER_NORMALIZATION");
  return normalized;
}

function eightTokenWindowSet(normalizedText) {
  const tokens = normalizedText.length === 0 ? [] : normalizedText.split(" ");
  const windows = [];
  if (tokens.length < 8) {
    windows.push(domainHash("EIGHT_TOKEN_WINDOW", canonicalBytes(tokens)));
  } else {
    for (let index = 0; index <= tokens.length - 8; index += 1) {
      windows.push(domainHash("EIGHT_TOKEN_WINDOW", canonicalBytes(tokens.slice(index, index + 8))));
    }
  }
  return [...new Set(windows)].sort();
}

function surfaceStructuralTemplate(normalizedVisibleSurface) {
  return normalizedVisibleSurface
    .replace(/[a-z]+/g, "w")
    .replace(/[0-9]+/g, "d")
    .replace(/(?:w )+w/g, "w+")
    .replace(/(?:d )+d/g, "d+");
}

export function deriveFingerprintBundle(inputs) {
  exactKeys(inputs, FINGERPRINT_INPUT_FIELDS, "FP_INPUT_FIELDS");
  assert(/^[0-9a-f]{64}$/.test(inputs.authorPrincipalCommitmentSha256), "FP_AUTHOR_PRINCIPAL_COMMITMENT");
  assert(Object.prototype.hasOwnProperty.call(FINGERPRINT_FAMILY_BY_TYPE, inputs.canonicalTypeId), "FP_TYPE_ID");
  assert(inputs.canonicalFamilyId === FINGERPRINT_FAMILY_BY_TYPE[inputs.canonicalTypeId], "FP_TYPE_FAMILY_BINDING");
  assert(Number.isInteger(inputs.rotationEpoch) && inputs.rotationEpoch >= 1, "FP_ROTATION_EPOCH");

  const normalizedFullText = normalizeFingerprintText(inputs.fullText);
  const normalizedVisibleSurface = normalizeFingerprintText(inputs.visibleSurface);
  const normalizedSurfaceTemplate = normalizeFingerprintText(inputs.surfaceTemplate);
  const normalizedTopicTags = normalizeTopicTags(inputs.topicTags);
  const normalizedScenarioEntities = normalizeScenarioEntities(inputs.scenarioEntities);
  const windowHashes = eightTokenWindowSet(normalizedFullText);
  const structuralTemplate = surfaceStructuralTemplate(normalizedVisibleSurface);

  const inputCommitments = {
    fullTextUtf8Sha256: rawUtf8Commitment("FULL_TEXT_UTF8", inputs.fullText),
    visibleSurfaceUtf8Sha256: rawUtf8Commitment("VISIBLE_SURFACE_UTF8", inputs.visibleSurface),
    surfaceTemplateUtf8Sha256: rawUtf8Commitment("SURFACE_TEMPLATE_UTF8", inputs.surfaceTemplate),
    topicTagsInputSha256: domainHash("INPUT:TOPIC_TAGS", canonicalBytes(inputs.topicTags)),
    scenarioEntitiesInputSha256: domainHash("INPUT:SCENARIO_ENTITIES", canonicalBytes(inputs.scenarioEntities)),
    authorPrincipalCommitmentSha256: inputs.authorPrincipalCommitmentSha256,
    canonicalTypeId: inputs.canonicalTypeId,
    canonicalFamilyId: inputs.canonicalFamilyId,
    rotationEpoch: inputs.rotationEpoch
  };
  const inputCommitmentRootSha256 = domainHash("INPUT_COMMITMENT_ROOT", canonicalBytes(inputCommitments));

  const components = {
    normalizedFullTextSha256: domainHash("COMPONENT:NORMALIZED_FULL_TEXT", Buffer.from(normalizedFullText, "utf8")),
    hashedEightWordWindowSetSha256: domainHash("COMPONENT:EIGHT_TOKEN_WINDOW_SET", canonicalBytes(windowHashes)),
    topicTagSetSha256: domainHash("COMPONENT:TOPIC_TAG_SET", canonicalBytes(normalizedTopicTags)),
    scenarioEntityTupleSha256: domainHash("COMPONENT:SCENARIO_ENTITY_TUPLE", canonicalBytes(normalizedScenarioEntities)),
    itemAuthorPrincipalSha256: domainHash("COMPONENT:ITEM_AUTHOR_PRINCIPAL", canonicalBytes({
      authorPrincipalCommitmentSha256: inputs.authorPrincipalCommitmentSha256,
      canonicalFamilyId: inputs.canonicalFamilyId,
      canonicalTypeId: inputs.canonicalTypeId,
      rotationEpoch: inputs.rotationEpoch
    })),
    surfaceTemplateFingerprintSha256: domainHash("COMPONENT:SURFACE_TEMPLATE", canonicalBytes({
      normalizedSurfaceTemplate,
      structuralTemplate
    })),
    compositeFingerprintSha256: ""
  };
  components.compositeFingerprintSha256 = domainHash("COMPONENT:COMPOSITE", canonicalBytes({
    canonicalFamilyId: inputs.canonicalFamilyId,
    canonicalTypeId: inputs.canonicalTypeId,
    componentDigestsInOrder: FINGERPRINT_COMPONENT_FIELDS.slice(0, 6).map((field) => components[field]),
    inputCommitmentRootSha256,
    rotationEpoch: inputs.rotationEpoch
  }));

  return {
    derivationVersion: FINGERPRINT_DERIVATION_VERSION,
    inputCommitments,
    inputCommitmentRootSha256,
    components
  };
}

export function validateFingerprintBundle(inputs, claimed) {
  exactKeys(claimed, ["derivationVersion", "inputCommitments", "inputCommitmentRootSha256", "components"], "FP_CLAIM_FIELDS");
  assert(claimed.derivationVersion === FINGERPRINT_DERIVATION_VERSION, "FP_DERIVATION_VERSION");
  exactKeys(claimed.components, FINGERPRINT_COMPONENT_FIELDS, "FP_COMPONENT_FIELDS");
  const derived = deriveFingerprintBundle(inputs);
  assert(canonicalizeJcs(claimed.inputCommitments) === canonicalizeJcs(derived.inputCommitments), "FP_INPUT_COMMITMENT_MISMATCH");
  assert(claimed.inputCommitmentRootSha256 === derived.inputCommitmentRootSha256, "FP_INPUT_ROOT_MISMATCH");
  for (const field of FINGERPRINT_COMPONENT_FIELDS) {
    assert(claimed.components[field] === derived.components[field], "FP_COMPONENT_MISMATCH", field);
  }
  return derived;
}

export const SLOT_FINGERPRINT_BINDING_FIELDS = Object.freeze([
  "slotId", "phase", "itemAuthorPrincipalCommitmentSha256", "canonicalTypeId", "canonicalFamilyId",
  "rotationEpoch", "fingerprintInputCommitmentRootSha256", "fingerprintCompositeSha256",
  "fingerprintDerivationProofSha256"
]);

export function deriveSlotFingerprintProof({ slotId, phase, bundle }) {
  assert(typeof slotId === "string" && /^(TP|MC|AH)-(G|B|N)-[0-9]{2}$/.test(slotId), "FP_SLOT_ID");
  assert(["TAXONOMY_PILOT", "MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"].includes(phase), "FP_SLOT_PHASE");
  exactKeys(bundle, ["derivationVersion", "inputCommitments", "inputCommitmentRootSha256", "components"], "FP_CLAIM_FIELDS");
  return domainHash("SLOT_DERIVATION_PROOF", canonicalBytes({
    bundle,
    phase,
    slotId
  }));
}

export function validateSlotFingerprintBinding(inputs, claimed, slotBinding) {
  exactKeys(slotBinding, SLOT_FINGERPRINT_BINDING_FIELDS, "FP_SLOT_BINDING_FIELDS");
  const derived = validateFingerprintBundle(inputs, claimed);
  assert(slotBinding.itemAuthorPrincipalCommitmentSha256 === inputs.authorPrincipalCommitmentSha256, "FP_SLOT_AUTHOR_BINDING");
  assert(slotBinding.canonicalTypeId === inputs.canonicalTypeId && slotBinding.canonicalFamilyId === inputs.canonicalFamilyId, "FP_SLOT_TYPE_FAMILY_BINDING");
  assert(slotBinding.rotationEpoch === inputs.rotationEpoch, "FP_SLOT_EPOCH_BINDING");
  assert(slotBinding.fingerprintInputCommitmentRootSha256 === derived.inputCommitmentRootSha256, "FP_SLOT_INPUT_ROOT_BINDING");
  assert(slotBinding.fingerprintCompositeSha256 === derived.components.compositeFingerprintSha256, "FP_SLOT_COMPOSITE_BINDING");
  assert(slotBinding.fingerprintDerivationProofSha256 === deriveSlotFingerprintProof({ slotId: slotBinding.slotId, phase: slotBinding.phase, bundle: derived }), "FP_SLOT_DERIVATION_PROOF_BINDING");
  const expectedPrefix = slotBinding.phase === "TAXONOMY_PILOT" ? "TP" : slotBinding.phase === "MAIN_CERTIFICATION" ? "MC" : "AH";
  const expectedBlock = inputs.canonicalTypeId === "GRAMMAR_ERROR" ? "G" : inputs.canonicalTypeId === "BLANK_INFERENCE" ? "B" : "N";
  assert(new RegExp(`^${expectedPrefix}-${expectedBlock}-[0-9]{2}$`).test(slotBinding.slotId), "FP_SLOT_PHASE_BLOCK_BINDING");
  return derived;
}
