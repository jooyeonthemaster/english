import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const PACKAGE_REL = "experiments/question-quality-20260715/design/evaluation-authority-v2";

export const UPSTREAMS = [
  {
    id: "all-types-evaluation-rubric-v1-rubric",
    path: "experiments/question-quality-20260715/design/all-types-evaluation-rubric-v1/rubric.json",
    sha256: "17960b41393df681a3626786aa638bd4b001a9fc39e6f838c6eb5a4942c86d3a",
    authority: "TYPE_RUBRIC_AND_FATAL_CRAFT_SEMANTICS",
  },
  {
    id: "all-types-evaluation-rubric-v1-manifest",
    path: "experiments/question-quality-20260715/design/all-types-evaluation-rubric-v1/MANIFEST.sha256",
    sha256: "9067d8641e463a5c955a5b73af162bf63fd181289f0ce67e95911c2c5beadf4d",
    authority: "PUBLIC_SOURCE_CLOSURE",
  },
  {
    id: "global-candidate-registry-v2-registry",
    path: "experiments/question-quality-20260715/design/global-candidate-registry-v2/registry.json",
    sha256: "1e2fc90252de8790ebd7df86e81602825c3fd8b50f5fa96de237ec3cc8fdbab1",
    authority: "EXACT_1000_CANDIDATE_ALLOCATION",
  },
  {
    id: "global-candidate-registry-v2-manifest",
    path: "experiments/question-quality-20260715/design/global-candidate-registry-v2/MANIFEST.sha256",
    sha256: "13f5fdb997c616694b297c6e3c22c22a2f60b97668bbe549589807a3acdd3f1e",
    authority: "PUBLIC_SOURCE_CLOSURE",
  },
  {
    id: "campaign-v6-s1-current-source-v2-plan",
    path: "experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/campaign-v6-s1-current-source-v2.json",
    sha256: "3fdff5bcbb6cc24f981dd09f3c53a0d2418c6089287fea906223b104097339a2",
    authority: "S1_EXACT_PUBLIC_ASSIGNMENT_AND_CURRENT_SOURCE_PLAN",
  },
  {
    id: "campaign-v6-s1-current-source-v2-manifest",
    path: "experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/MANIFEST.sha256",
    sha256: "8554231197d0e2a5194ef9a44c36750e820333183cb3ce6c4299d5e69c307d43",
    authority: "PUBLIC_SOURCE_CLOSURE",
  },
  {
    id: "reviewer-calibration-v3-replacement-v1-protocol",
    path: "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/protocol.json",
    sha256: "4c27307bf83586a5ffb5301f4aaa6915ca5da8ec4e985f9a259185da8495e162",
    authority: "TAXONOMY_AND_CALIBRATION_SEMANTICS_ONLY",
  },
  {
    id: "reviewer-calibration-v3-replacement-v1-manifest",
    path: "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/MANIFEST.sha256",
    sha256: "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64",
    authority: "PUBLIC_SOURCE_CLOSURE",
  },
  {
    id: "reviewer-calibration-v3-production-type-binding-v4-subject-manifest",
    path: "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/MANIFEST.sha256",
    sha256: "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04",
    authority: "PRODUCTION_TYPE_BINDING_SUBJECT",
  },
  {
    id: "reviewer-calibration-v3-production-type-binding-v4-independent-audit-manifest",
    path: "experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/MANIFEST.sha256",
    sha256: "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d",
    authority: "INDEPENDENT_PASS_NO_BLOCKERS",
  },
] as const;

export const PACKAGE_FILES = [
  "authority-core.mts",
  "build.mts",
  "verify.mts",
  "hostile-tests.mts",
  "tsconfig.json",
  "README.md",
  "protocol.json",
  "PROTOCOL.md",
] as const;

export const MANIFEST_FILES = [...PACKAGE_FILES, "public-manifest.json"] as const;

const PHASES = [
  "PRE_ACCESS_UNAUTHORIZED",
  "TAXONOMY_PILOT_12_ISSUED",
  "TAXONOMY_PILOT_12_PASSED_SEALED",
  "MAIN_CERTIFICATION_24_ISSUED",
  "MAIN_CERTIFICATION_24_PASSED_SEALED",
  "INDEPENDENT_TRUSTED_GOLD_AUDIT_PASSED_SEALED",
  "ACTIVATION_HOLDOUT_24_ISSUED",
  "ACTIVATION_HOLDOUT_24_PASSED_SEALED",
  "EVALUATOR_AUTHORITY_GRANTED",
] as const;

const ACCESS_EVENT_FIELDS = [
  "eventId",
  "eventOrdinal",
  "priorEventSha256",
  "occurredAtRfc3339",
  "actorPseudonym",
  "actorRole",
  "phase",
  "action",
  "artifactId",
  "artifactSha256",
  "packetSha256",
  "resourceSha256",
  "visibleSurfaceSha256",
  "capabilityTokenSha256",
  "authorizationEventSha256",
  "authorizedAtRfc3339",
  "openedAtRfc3339",
  "closedAtRfc3339",
  "decision",
  "reasonCode",
  "eventSha256",
] as const;

const ACCESS_EVENT_CONSTRAINTS = [
  "AUTHORIZATION_EVENT_MUST_PRECEDE_THE_BOUND_ACCESS_RECEIPT_IN_THE_APPEND_ONLY_CHAIN",
  "AUTHORIZED_AT_MUST_BE_STRICTLY_EARLIER_THAN_OPENED_AT",
  "OPENED_AT_MUST_BE_EARLIER_THAN_OR_EQUAL_TO_CLOSED_AT",
  "ACCESS_RECEIPT_MUST_BIND_PRIOR_ALLOW_EVENT_ACTOR_PHASE_RESOURCE_VISIBLE_SURFACE_AND_CAPABILITY_TOKEN",
  "AUTHORIZATION_EVENT_SHA256_MUST_RESOLVE_TO_THE_PRIOR_ALLOW_EVENT",
  "DENY_EVENT_MUST_HAVE_NULL_AUTHORIZATION_EVENT_OPENED_AT_CLOSED_AT_AND_NO_ACCESS_RECEIPT",
  "EVENT_ORDINAL_TIMESTAMP_AND_PRIOR_HASH_CHAIN_FORBID_RETROACTIVE_INSERTION_OR_REWRITE",
] as const;

const ROLE_INCOMPATIBILITIES = [
  ["PACKET_AUTHOR", "TAXONOMY_PILOT_RATER"],
  ["PACKET_AUTHOR", "MAIN_CERTIFICATION_RATER"],
  ["PACKET_AUTHOR", "TRUSTED_GOLD_AUDITOR"],
  ["PACKET_AUTHOR", "ACTIVATION_HOLDOUT_RATER"],
  ["PACKET_AUTHOR", "S1_REVIEWER"],
  ["PACKET_AUTHOR", "S1_ADJUDICATOR"],
  ["TRUSTED_GOLD_AUDITOR", "TAXONOMY_PILOT_RATER"],
  ["TRUSTED_GOLD_AUDITOR", "MAIN_CERTIFICATION_RATER"],
  ["TRUSTED_GOLD_AUDITOR", "ACTIVATION_HOLDOUT_RATER"],
  ["TRUSTED_GOLD_AUDITOR", "S1_REVIEWER"],
  ["TRUSTED_GOLD_AUDITOR", "S1_ADJUDICATOR"],
  ["S1_REVIEWER", "S1_ADJUDICATOR"],
  ["S1_RESULT_CUSTODIAN", "S1_REVIEWER"],
  ["S1_RESULT_CUSTODIAN", "S1_ADJUDICATOR"],
] as const;

const DENY_SETS = {
  PRE_ACCESS_UNAUTHORIZED: [
    "TAXONOMY_PILOT_REVEAL",
    "MAIN_CERTIFICATION_PACKET_OR_REVEAL",
    "TRUSTED_GOLD",
    "ACTIVATION_HOLDOUT_PACKET_OR_REVEAL",
    "S1_RESULT_OR_SCORE",
    "PROFILE_OR_GENERATOR_IDENTITY",
  ],
  TAXONOMY_PILOT_12_ISSUED: [
    "TAXONOMY_PILOT_REVEAL_UNTIL_OWN_RESPONSE_SEAL",
    "OTHER_PILOT_RATER_RECORDS",
    "MAIN_CERTIFICATION_PACKET_OR_REVEAL",
    "TRUSTED_GOLD",
    "ACTIVATION_HOLDOUT_PACKET_OR_REVEAL",
    "S1_RESULT_OR_SCORE",
  ],
  TAXONOMY_PILOT_12_PASSED_SEALED: [
    "MAIN_CERTIFICATION_REVEAL_UNTIL_OWN_PHASE1_RESPONSE_SEAL",
    "OTHER_MAIN_RATER_RECORDS",
    "TRUSTED_GOLD",
    "ACTIVATION_HOLDOUT_PACKET_OR_REVEAL",
    "S1_RESULT_OR_SCORE",
  ],
  MAIN_CERTIFICATION_24_ISSUED: [
    "MAIN_CERTIFICATION_REVEAL_UNTIL_OWN_PHASE1_RESPONSE_SEAL",
    "OTHER_MAIN_RATER_RECORDS_UNTIL_ALL_PHASE2_SEALS",
    "TRUSTED_GOLD",
    "ACTIVATION_HOLDOUT_PACKET_OR_REVEAL",
    "S1_RESULT_OR_SCORE",
  ],
  MAIN_CERTIFICATION_24_PASSED_SEALED: [
    "TRUSTED_GOLD_TO_ANY_ROLE_EXCEPT_PREAUTHORIZED_INDEPENDENT_AUDITOR",
    "ACTIVATION_HOLDOUT_PACKET_OR_REVEAL_UNTIL_AUDIT_PASS_SEAL",
    "OTHER_RATER_IDENTITIES",
    "S1_RESULT_OR_SCORE",
  ],
  INDEPENDENT_TRUSTED_GOLD_AUDIT_PASSED_SEALED: [
    "ACTIVATION_HOLDOUT_REVEAL_UNTIL_OWN_RESPONSE_SEAL",
    "OTHER_HOLDOUT_RATER_RECORDS",
    "TRUSTED_GOLD_TO_HOLDOUT_RATERS",
    "S1_RESULT_OR_SCORE",
  ],
  ACTIVATION_HOLDOUT_24_ISSUED: [
    "ACTIVATION_HOLDOUT_REVEAL_UNTIL_OWN_RESPONSE_SEAL",
    "OTHER_HOLDOUT_RATER_RECORDS_UNTIL_ALL_RESPONSE_SEALS",
    "TRUSTED_GOLD_TO_HOLDOUT_RATERS",
    "S1_RESULT_OR_SCORE",
  ],
  ACTIVATION_HOLDOUT_24_PASSED_SEALED: [
    "S1_RESULT_OR_SCORE_UNTIL_SEPARATE_AUTHORITY_ACTIVATION_SEAL",
    "PROFILE_OR_GENERATOR_IDENTITY",
    "OTHER_RATER_IDENTITIES",
  ],
  EVALUATOR_AUTHORITY_GRANTED: [
    "S1_RESULT_OR_SCORE_UNTIL_S1_BLIND_PACKET_SEAL_AND_BOUND_ALLOW_RECEIPT",
    "S1_HIDDEN_COMMITMENT_CONTENT_DURING_PHASE1",
    "OTHER_RATER_IDENTITIES",
  ],
} as const;

const S1_PHASE1_ALLOWED_FIELDS = [
  "blindedItemId",
  "packetOrdinal",
  "blindedOptionLabelsAndRelabelMapSurface",
  "studentVisibleDirections",
  "studentVisiblePassage",
  "studentVisibleStem",
  "studentVisibleUnderlinesOrMarkers",
  "studentVisibleOptions",
  "studentVisibleResponseSpace",
] as const;

const S1_PHASE1_HIDDEN_CLASSES = [
  "PLAN",
  "MODEL_PROVIDER_ROUTE",
  "PROFILE_PROMPT_ARM",
  "COST_TOKEN_USAGE",
  "STORED_ANSWER_KEY",
  "EXPLANATION_KEYPOINTS_WRONG_OPTION_EXPLANATIONS",
  "AUTHOR_TARGET_GRADE",
  "GENERATION_METADATA",
] as const;

export function buildProtocol() {
  return {
    schemaVersion: "evaluation-authority-v2",
    artifactId: "evaluation-authority-v2",
    status: "DESIGN_ONLY_EXECUTION_BLOCKED",
    permanentDesignBoundary: {
      evaluatorAuthorityGranted: false,
      scoringAuthorityGranted: false,
      authorizedReviewers: 0,
      authorizedAdjudicators: 0,
      generationAuthorized: false,
      s1ResultAccessAuthorized: false,
      s1ScoringAuthorized: false,
      profileSelectionAuthorized: false,
      releaseClaimAuthorized: false,
      mutationRule: "THIS_DESIGN_ARTIFACT_NEVER_TRANSITIONS; A_SEPARATE_IMMUTABLE_EXECUTION_EVIDENCE_PACKAGE_IS_REQUIRED",
    },
    publicOnlyBoundary: {
      allowed: "EXACT_PUBLIC_FILES_LISTED_IN_UPSTREAMS_ONLY",
      forbidden: [
        "ANY_PATH_COMPONENT_NAMED_PRIVATE",
        "TRUSTED_OR_PENDING_GOLD_CONTENT",
        "ANSWER_OR_REVEAL_PAYLOAD",
        "ENV_OR_SECRET",
        "DATABASE",
        "NETWORK",
        "MODEL_OR_API",
        "BUDGET_LEDGER",
      ],
      activity: {
        privateReads: 0,
        goldReads: 0,
        revealReads: 0,
        envReads: 0,
        databaseCalls: 0,
        networkCalls: 0,
        modelCalls: 0,
        ledgerReadsOrWrites: 0,
      },
    },
    upstreams: UPSTREAMS.map((row) => ({ ...row })),
    upstreamAuthorityBoundary: {
      allTypesRubric: "RUBRIC_SEMANTICS_NOT_REVIEWER_AUTHORIZATION",
      globalRegistry: "EXACT_ALLOCATION_NOT_EXECUTION_AUTHORIZATION",
      s1CurrentSource: "PUBLIC_PLAN_AND_QUEUE_BINDING_NOT_RESULT_ACCESS_AUTHORIZATION",
      calibrationV3: "TAXONOMY_SEMANTICS_NOT_A_CERTIFICATE_OR_SCORING_AUTHORITY",
      productionTypeBindingV4: {
        subjectManifestSha256: "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04",
        independentAuditManifestSha256: "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d",
        auditVerdict: "PASS_NO_BLOCKERS",
        grantsEvaluatorAuthority: false,
        grantsScoringAuthority: false,
      },
    },
    supersession: {
      artifactId: "blind-adjudication-power-v1",
      status: "SUPERSEDED_NO_SCORING_OR_ALLOCATION_AUTHORITY",
      legacyAllocationExplicitlyRejected: {
        scheduledRows: 998,
        connectivityRows: 2,
        disposition: "REPLACED_BY_GLOBAL_CANDIDATE_REGISTRY_V2_EXACT_1000_STAGE_REGISTRY",
      },
      legacySingletonFieldsExplicitlyRejected: ["pointFamily", "primaryIntentAxis", "divergentAxes"],
      replacementSemantics: {
        grammar: "SEALED_ACCEPTED_POINT_FAMILY_SET_AND_CORRECTION_EQUIVALENCE_GROUPS",
        blank: "SEVEN_AXIS_RELATION_VECTOR_WITH_ONE_OR_TWO_DECISIVE_AXES_AND_MECHANISM_TAG_SET",
        allocation: "C0_2_S1_180_S2_480_S3_92_S4_144_S5_102",
      },
      scoringAuthorityGranted: false,
    },
    exactCandidateAllocation: {
      cap: 1000,
      currentUsed: 0,
      C0_CONNECTIVITY: 2,
      S1_FOCUS_PROFILE_SCREEN: 180,
      S2_FOCUS_HELDOUT: 480,
      S3_NONFOCUS_SENTINELS: 92,
      S4_ROUTE_PARITY: 144,
      S5_FOCUS_RISK_GRID: 102,
      sum: 1000,
      outcomeDrivenReallocationAllowed: false,
      replacementOrTopupAllowed: false,
    },
    taxonomySemantics: {
      source: "reviewer-calibration-v3-replacement-v1",
      grammar: {
        displayedGrammaticality: ["GRAMMATICAL", "UNGRAMMATICAL", "GENUINELY_CONTESTED"],
        diagnosis: ["ANSWER_ERROR", "VALID_DECOY", "INVALID_SITE"],
        acceptedPointFamilies: "NONEMPTY_SEALED_SET_FOR_ERROR_EMPTY_ONLY_FOR_VALID_DECOY",
        acceptedCorrectionEquivalenceSets: "ONE_OR_MORE_SEALED_SEMANTIC_EQUIVALENCE_GROUPS",
        nonCompensableFields: [
          "displayedGrammaticality",
          "diagnosis",
          "correctionRestoresSource",
          "explanationClaimsAccurate",
        ],
        singletonPointFamilyRequired: false,
        exactCorrectionStringRequired: false,
        postIssueExpansionAllowed: false,
      },
      blank: {
        propositionAxes: [
          "actorOrTarget",
          "polarity",
          "conditionOrModality",
          "causalRelationAndDirection",
          "scopeOrQuantifier",
          "stance",
          "temporalRelation",
        ],
        axisRelations: [
          "PRESERVED",
          "REVERSED",
          "NARROWED",
          "BROADENED",
          "OMITTED",
          "UNSUPPORTED_ADDITION",
          "SHIFTED",
          "NOT_APPLICABLE",
        ],
        everyOptionHasAllSevenAxes: true,
        decisiveAxesMinimum: 1,
        decisiveAxesMaximum: 2,
        irreducibleCompoundDisposition: "REJECT_IF_MORE_THAN_TWO_DECISIVE_AXES",
        singletonIntentRequired: false,
        slotGrammarCompatibleNonCompensable: true,
        uniqueAnswerNonCompensable: true,
        postIssueExpansionAllowed: false,
      },
      nonfocus: {
        familyCount: 8,
        mainAnchors: 8,
        claimBoundary: "CONSTRUCT_FAMILY_TRANSFER_ONLY_NOT_INDEPENDENT_ACCURACY_FOR_23_TYPES",
        allTypeAuthorization: "REQUIRES_EACH_BOUND_TYPE_IN_FRESH_MAIN_OR_HOLDOUT_WITH_OWN_ANSWER_AND_FATAL_CHECKS",
      },
      responseAndGrade: {
        fatalOverridesCraft: true,
        F: "ANY_ADJUDICATED_FATAL_CODE",
        C: "NO_FATAL_BUT_AT_LEAST_ONE_ZERO_CRAFT_DIMENSION_OR_MAJOR_REMEDIABLE_WEAKNESS",
        B: "VALID_COMPETENT_NO_ZERO_DIMENSION_NO_UNRESOLVED_MAJOR_WEAKNESS",
        A: "VALID_ALL_DIMENSIONS_AT_LEAST_TWO_AT_LEAST_THREE_DIMENSIONS_AT_THREE_NO_CHEAP_GIVEAWAY_OR_EXTRANEOUS_EXPLANATION",
        authorTargetGradeIsEvidence: false,
        storedAnswerIsAuthority: false,
        majorityVoteIsAuthority: false,
      },
    },
    calibrationSequence: {
      exactOrder: [
        { phase: "TAXONOMY_PILOT", freshItems: 12, blocks: { GRAMMAR: 4, BLANK: 4, NONFOCUS: 4 } },
        { phase: "MAIN_CERTIFICATION", freshItems: 24, blocks: { GRAMMAR: 8, BLANK: 8, NONFOCUS: 8 } },
        { phase: "INDEPENDENT_TRUSTED_GOLD_AUDIT", freshItems: 0, independent: true },
        { phase: "ACTIVATION_HOLDOUT", freshItems: 24, blocks: { GRAMMAR: 8, BLANK: 8, NONFOCUS: 8 } },
      ],
      pairwiseDisjoint: true,
      taxonomyRevisionAfterAnyLaterPacketOpen: false,
      retroactivePass: false,
      thresholdRelaxationAfterOpening: false,
      failedItemReplay: false,
      trustedGoldAuditBoundary: "AUDITS_PRESEALED_TRUTH_AND_PHASE_INTEGRITY; DOES_NOT_GRANT_PRODUCTION_SCORING_AUTHORITY",
    },
    roles: {
      requiredForActivation: {
        certifiedReviewers: 2,
        freshAdjudicators: 1,
      },
      freshness: {
        reviewersMustBeDistinct: true,
        adjudicatorMustBeDistinctFrom: [
          "PACKET_AUTHOR",
          "TRUSTED_GOLD_AUDITOR",
          "CERTIFIED_REVIEWER_1",
          "CERTIFIED_REVIEWER_2",
          "ANY_PRIOR_S1_RESULT_VIEWER",
        ],
      },
      roleIncompatibilities: ROLE_INCOMPATIBILITIES.map((pair) => [...pair]),
      samePersonAcrossIncompatibleRolesAllowed: false,
      saltedPseudonymRegistryRequired: true,
    },
    accessControl: {
      currentState: "PRE_ACCESS_UNAUTHORIZED",
      stateOrder: [...PHASES],
      immutableAccessEventSchema: {
        requiredFields: [...ACCESS_EVENT_FIELDS],
        hashAlgorithm: "SHA-256",
        appendOnly: true,
        ordinalStartsAt: 1,
        priorHashGenesis: "0".repeat(64),
        eventKinds: ["AUTHORIZATION", "ACCESS_RECEIPT", "DENIAL"],
        decisions: ["ALLOW", "DENY"],
        timeOrder: "authorizedAtRfc3339 < openedAtRfc3339 <= closedAtRfc3339",
        receiptBinding: [
          "PRIOR_ALLOW_AUTHORIZATION_EVENT_SHA256",
          "ACTOR_PSEUDONYM_AND_ROLE",
          "PHASE",
          "RESOURCE_SHA256",
          "VISIBLE_SURFACE_SHA256",
          "CAPABILITY_TOKEN_SHA256",
        ],
        constraints: [...ACCESS_EVENT_CONSTRAINTS],
        deniedAttemptsMustBeRecorded: true,
        denyHasOpenReceipt: false,
        retroactiveEventsAllowed: false,
        deletionOrRewriteAllowed: false,
      },
      observedAccessEvents: [],
      denySets: Object.fromEntries(Object.entries(DENY_SETS).map(([state, denied]) => [state, [...denied]])),
      accessRules: [
        "EVERY_OPEN_REQUIRES_A_PRIOR_SEALED_ALLOW_AUTHORIZATION_AND_CAPABILITY_TOKEN",
        "EVERY_COMPLETED_OPEN_REQUIRES_A_CLOSE_RECEIPT_WITH_AUTHORIZED_OPENED_CLOSED_TIME_ORDER",
        "RECEIPT_BINDS_ACTOR_PHASE_RESOURCE_VISIBLE_SURFACE_CAPABILITY_AND_PRIOR_ALLOW_EVENT",
        "DENIED_ATTEMPT_HAS_NO_OPEN_RECEIPT_AND_IS_STILL_APPEND_ONLY_RECORDED",
        "RETROACTIVE_AUTHORIZATION_OR_EVENT_INSERTION_IS_FORBIDDEN",
        "BLIND_PACKET_ACCESS_PRECEDES_OWN_RESPONSE_SEAL_ONLY",
        "REVEAL_ACCESS_REQUIRES_OWN_BLIND_RESPONSE_SEAL",
        "OTHER_RATER_RESPONSES_DENIED_UNTIL_ALL_PHASE_TWO_RECORDS_SEALED",
        "TRUSTED_GOLD_ACCESS_LIMITED_TO_INDEPENDENT_AUDITOR_AFTER_MAIN_DECISION_SEAL",
        "ACTIVATION_HOLDOUT_ACCESS_REQUIRES_INDEPENDENT_AUDIT_PASS_SEAL",
        "S1_RESULT_ACCESS_REQUIRES_AUTHORITY_TWO_CERTIFIED_REVIEWERS_FRESH_ADJUDICATOR_AND_PRESEALED_S1_PACKET",
      ],
      requiredPhaseSeals: [
        "TAXONOMY_PILOT_PACKET_SHA256",
        "TAXONOMY_PILOT_ALL_RESPONSE_SHA256S",
        "TAXONOMY_PILOT_DECISION_SHA256",
        "MAIN_PACKET_SHA256",
        "MAIN_ALL_PHASE1_RESPONSE_SHA256S",
        "MAIN_REVEAL_SHA256",
        "MAIN_ALL_PHASE2_RESPONSE_SHA256S",
        "MAIN_DECISION_SHA256",
        "TRUSTED_GOLD_AUDIT_INPUT_SHA256",
        "TRUSTED_GOLD_AUDIT_REPORT_SHA256",
        "HOLDOUT_PACKET_SHA256",
        "HOLDOUT_ALL_RESPONSE_SHA256S",
        "HOLDOUT_DECISION_SHA256",
        "AUTHORITY_ACTIVATION_SHA256",
        "S1_BLIND_PACKET_SHA256_BEFORE_ANY_RESULT_ACCESS",
      ],
      observedPhaseSeals: [],
    },
    stateMachine: {
      initial: "PRE_ACCESS_UNAUTHORIZED",
      transitions: [
        {
          from: "PRE_ACCESS_UNAUTHORIZED",
          to: "TAXONOMY_PILOT_12_ISSUED",
          gates: ["12_FRESH_TAXONOMY_ITEMS_PRESEALED", "ROLE_REGISTRY_SEALED", "ISSUE_ACCESS_EVENT_SEALED"],
        },
        {
          from: "TAXONOMY_PILOT_12_ISSUED",
          to: "TAXONOMY_PILOT_12_PASSED_SEALED",
          gates: ["ALL_BLIND_RESPONSES_SEALED", "THRESHOLDS_PASS", "DECISION_AND_ACCESS_EVENTS_SEALED"],
        },
        {
          from: "TAXONOMY_PILOT_12_PASSED_SEALED",
          to: "MAIN_CERTIFICATION_24_ISSUED",
          gates: ["24_FRESH_DISJOINT_MAIN_ITEMS_PRESEALED", "PILOT_DECISION_HASH_BOUND", "ISSUE_ACCESS_EVENT_SEALED"],
        },
        {
          from: "MAIN_CERTIFICATION_24_ISSUED",
          to: "MAIN_CERTIFICATION_24_PASSED_SEALED",
          gates: ["PHASE1_BEFORE_REVEAL", "ALL_PHASE2_RECORDS_SEALED", "TWO_REVIEWERS_PASS", "MAIN_DECISION_SEALED"],
        },
        {
          from: "MAIN_CERTIFICATION_24_PASSED_SEALED",
          to: "INDEPENDENT_TRUSTED_GOLD_AUDIT_PASSED_SEALED",
          gates: ["AUDITOR_ROLE_FRESH_AND_COMPATIBLE", "TRUSTED_GOLD_ACCESS_EVENTS_SEALED", "AUDIT_PASS_REPORT_SEALED"],
        },
        {
          from: "INDEPENDENT_TRUSTED_GOLD_AUDIT_PASSED_SEALED",
          to: "ACTIVATION_HOLDOUT_24_ISSUED",
          gates: ["24_FRESH_DISJOINT_HOLDOUT_ITEMS_PRESEALED", "AUDIT_PASS_HASH_BOUND", "ISSUE_ACCESS_EVENT_SEALED"],
        },
        {
          from: "ACTIVATION_HOLDOUT_24_ISSUED",
          to: "ACTIVATION_HOLDOUT_24_PASSED_SEALED",
          gates: ["ONE_TIME_BLIND_RESPONSES_SEALED", "TWO_REVIEWERS_PASS", "HOLDOUT_DECISION_SEALED"],
        },
        {
          from: "ACTIVATION_HOLDOUT_24_PASSED_SEALED",
          to: "EVALUATOR_AUTHORITY_GRANTED",
          gates: [
            "TWO_DISTINCT_CURRENT_CERTIFICATES_BOUND",
            "ONE_FRESH_ADJUDICATOR_BOUND",
            "ALL_ACCESS_EVENTS_AND_PHASE_SEALS_VERIFIED",
            "SEPARATE_ACTIVATION_ARTIFACT_INDEPENDENTLY_AUDITED",
          ],
        },
      ],
      skippedOrReorderedTransitionAllowed: false,
      transitionWithoutImmutableEvidenceAllowed: false,
      currentCompletedTransitions: 0,
    },
    s1EvaluationGate: {
      upstreamPlanArtifact: "campaign-v6-s1-current-source-v2",
      allocation: {
        total: 180,
        grammar: 96,
        blank: 84,
        standard: 96,
        premium: 84,
        intermediate: 90,
        killer: 90,
      },
      minimumCellN: 6,
      inferenceUnit: "PASSAGE_CLUSTER",
      permittedPurpose: [
        "MECHANISM_SCREEN",
        "BINDING_AND_DETERMINISTIC_SAFETY_SCREEN",
        "YIELD_AND_COST_ENVELOPE_SCREEN",
        "NEW_FATAL_FAMILY_DISCOVERY",
      ],
      forbiddenAtN6: [
        "ARM_RANKING",
        "PROFILE_WINNER_SELECTION",
        "SUPERIORITY_OR_NONINFERIORITY_CLAIM",
        "P_VALUE_OR_CONFIDENCE_INTERVAL_RANKING",
        "RELEASE_OR_MODEL_QUALITY_CLAIM",
      ],
      s1BlindPacketMustSealBeforeAnyResultAccess: true,
      s1BlindPacketRequiredBindings: [
        "ALL_180_ASSIGNMENT_IDS_AND_CLUSTER_HASHES",
        "TYPE_PLAN_DIFFICULTY_PROFILE_CELL",
        "PACKET_ORDER_AND_RELABEL_MAP",
        "RUBRIC_AND_TAXONOMY_HASHES",
        "REVIEWER_PSEUDONYMS_AND_ROLE_REGISTRY_HASH",
        "REVEAL_POLICY_AND_PHASE_ORDER",
      ],
      phase1VisibleSurface: {
        allowOnly: [...S1_PHASE1_ALLOWED_FIELDS],
        hiddenClasses: [...S1_PHASE1_HIDDEN_CLASSES],
        hiddenFieldExamples: {
          PLAN: ["plan", "tier"],
          MODEL_PROVIDER_ROUTE: ["model", "provider", "providerOrder", "route", "endpoint"],
          PROFILE_PROMPT_ARM: ["profileId", "promptArm", "treatment", "controlOrChallenger"],
          COST_TOKEN_USAGE: ["cost", "price", "inputTokens", "outputTokens", "usage", "latency"],
          STORED_ANSWER_KEY: ["answer", "answerKey", "correctLabel", "acceptedAnswerSets"],
          EXPLANATION_KEYPOINTS_WRONG_OPTION_EXPLANATIONS: ["explanation", "keyPoints", "wrongOptionExplanations"],
          AUTHOR_TARGET_GRADE: ["authorHypothesis", "targetGrade", "authorGrade"],
          GENERATION_METADATA: ["runId", "candidateId", "generatedAt", "retryCount", "rawResponse", "generationTrace"],
        },
        studentVisibleOnly: true,
        blindedIdentityOrderAndRelabelOnly: true,
        leakageDisposition: "QUARANTINE_PACKET_REVOKE_CAPABILITY_RECORD_DENY_EVENT_NO_RESULT_ACCESS",
      },
      hiddenCommitment: {
        separateFromPhase1VisibleSurface: true,
        sealedBeforePacketIssue: true,
        hashAlgorithm: "SHA-256",
        requiredBindings: [
          "PLAN_MODEL_PROVIDER_ROUTE",
          "PROFILE_PROMPT_ARM",
          "COST_TOKEN_USAGE",
          "STORED_ANSWER_KEY",
          "EXPLANATION_KEYPOINTS_WRONG_OPTION_EXPLANATIONS",
          "AUTHOR_TARGET_GRADE",
          "GENERATION_METADATA",
          "VISIBLE_SURFACE_SHA256",
          "PACKET_ORDER_AND_RELABEL_COMMITMENT",
        ],
        commitmentContentVisibleInPhase1: false,
        revealRequiresOwnPhase1ResponseSealAndBoundAllowReceipt: true,
      },
      resultAccessRequires: [
        "EVALUATOR_AUTHORITY_GRANTED",
        "TWO_CERTIFIED_REVIEWERS",
        "ONE_FRESH_ADJUDICATOR",
        "S1_BLIND_PACKET_SEALED_BEFORE_FIRST_RESULT_ACCESS",
        "IMMUTABLE_ALLOW_EVENT_FOR_EACH_ACCESS",
      ],
      preAuthorityClaims: {
        itemScoresAllowed: false,
        aggregateScoresAllowed: false,
        armRankingAllowed: false,
        profileSelectionAllowed: false,
        releaseClaimAllowed: false,
      },
      eligibleAssignments: 0,
    },
    activationSnapshot: {
      currentState: "PRE_ACCESS_UNAUTHORIZED",
      evaluatorAuthorityGranted: false,
      authorizedReviewers: 0,
      requiredReviewers: 2,
      authorizedAdjudicators: 0,
      requiredFreshAdjudicators: 1,
      accessEventCount: 0,
      phaseSealCount: 0,
      s1PacketSealed: false,
      s1ResultAccessAuthorized: false,
      status: "PRE_ACCESS_UNAUTHORIZED",
    },
    claims: {
      deterministicDesignContractOnly: true,
      scoringAuthority: "NONE",
      evaluatorAuthority: "NONE",
      reviewerCertificate: "NONE",
      adjudicatorAuthorization: "NONE",
      s1QualityScore: "NONE",
      profileSelection: "NONE",
      release: "NONE",
    },
  } as const;
}

export type AuthorityProtocol = ReturnType<typeof buildProtocol>;

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Bytes(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sha256File(filePath: string): Promise<string> {
  return sha256Bytes(await readFile(filePath));
}

export function repoRootFromPackage(packageDir: string): string {
  return path.resolve(packageDir, "../../../..");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function walk(value: unknown, pointer: string, visit: (value: unknown, pointer: string) => void): void {
  visit(value, pointer);
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, `${pointer}/${index}`, visit));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, `${pointer}/${key}`, visit);
    }
  }
}

export function validateProtocol(value: unknown, requireCanonical = true): asserts value is AuthorityProtocol {
  assert(value && typeof value === "object" && !Array.isArray(value), "protocol must be object");
  const p = value as Record<string, any>;
  assert(p.schemaVersion === "evaluation-authority-v2", "wrong schema version");
  assert(p.status === "DESIGN_ONLY_EXECUTION_BLOCKED", "status escalation");
  assert(p.permanentDesignBoundary?.evaluatorAuthorityGranted === false, "evaluator authority escalation");
  assert(p.permanentDesignBoundary?.scoringAuthorityGranted === false, "scoring authority escalation");
  assert(p.permanentDesignBoundary?.authorizedReviewers === 0, "reviewer authorization escalation");
  assert(p.permanentDesignBoundary?.authorizedAdjudicators === 0, "adjudicator authorization escalation");
  assert(p.activationSnapshot?.currentState === "PRE_ACCESS_UNAUTHORIZED", "current state must remain pre-access");
  assert(p.activationSnapshot?.accessEventCount === 0, "design artifact cannot contain access events");
  assert(p.activationSnapshot?.phaseSealCount === 0, "design artifact cannot contain phase seals");
  assert(Array.isArray(p.accessControl?.observedAccessEvents) && p.accessControl.observedAccessEvents.length === 0, "unexpected access evidence");
  assert(Array.isArray(p.accessControl?.observedPhaseSeals) && p.accessControl.observedPhaseSeals.length === 0, "unexpected phase evidence");

  const allocation = p.exactCandidateAllocation;
  const total = allocation?.C0_CONNECTIVITY + allocation?.S1_FOCUS_PROFILE_SCREEN + allocation?.S2_FOCUS_HELDOUT
    + allocation?.S3_NONFOCUS_SENTINELS + allocation?.S4_ROUTE_PARITY + allocation?.S5_FOCUS_RISK_GRID;
  assert(total === 1000 && allocation?.sum === 1000 && allocation?.cap === 1000, "allocation mismatch");
  assert(allocation.C0_CONNECTIVITY === 2 && allocation.S1_FOCUS_PROFILE_SCREEN === 180, "C0/S1 mismatch");
  assert(allocation.S2_FOCUS_HELDOUT === 480 && allocation.S3_NONFOCUS_SENTINELS === 92, "S2/S3 mismatch");
  assert(allocation.S4_ROUTE_PARITY === 144 && allocation.S5_FOCUS_RISK_GRID === 102, "S4/S5 mismatch");
  assert(allocation.outcomeDrivenReallocationAllowed === false && allocation.replacementOrTopupAllowed === false, "reallocation leakage");

  assert(Array.isArray(p.upstreams) && p.upstreams.length === UPSTREAMS.length, "upstream cardinality mismatch");
  assert(stableJson(p.upstreams) === stableJson(UPSTREAMS.map((row) => ({ ...row }))), "unbound or changed upstream");

  const phases = p.calibrationSequence?.exactOrder;
  assert(Array.isArray(phases) && phases.length === 4, "calibration phase cardinality");
  assert(phases[0]?.phase === "TAXONOMY_PILOT" && phases[0]?.freshItems === 12, "pilot order/count");
  assert(phases[1]?.phase === "MAIN_CERTIFICATION" && phases[1]?.freshItems === 24, "main order/count");
  assert(phases[2]?.phase === "INDEPENDENT_TRUSTED_GOLD_AUDIT" && phases[2]?.independent === true, "audit order/independence");
  assert(phases[3]?.phase === "ACTIVATION_HOLDOUT" && phases[3]?.freshItems === 24, "holdout order/count");
  assert(stableJson(p.accessControl?.stateOrder) === stableJson(PHASES), "state order changed");
  assert(p.stateMachine?.transitions?.length === PHASES.length - 1, "transition count changed");
  p.stateMachine.transitions.forEach((transition: any, index: number) => {
    assert(transition.from === PHASES[index] && transition.to === PHASES[index + 1], `transition ${index} reordered`);
    assert(Array.isArray(transition.gates) && transition.gates.length >= 3, `transition ${index} gates missing`);
  });
  assert(p.stateMachine?.transitionWithoutImmutableEvidenceAllowed === false, "evidenceless transition allowed");

  assert(p.roles?.requiredForActivation?.certifiedReviewers === 2, "two-reviewer gate missing");
  assert(p.roles?.requiredForActivation?.freshAdjudicators === 1, "fresh adjudicator gate missing");
  assert(p.roles?.samePersonAcrossIncompatibleRolesAllowed === false, "role incompatibility weakened");
  assert(stableJson(p.roles?.roleIncompatibilities) === stableJson(ROLE_INCOMPATIBILITIES.map((pair) => [...pair])), "role incompatibility set changed");
  assert(p.accessControl?.immutableAccessEventSchema?.deniedAttemptsMustBeRecorded === true, "deny evidence missing");
  assert(stableJson(p.accessControl?.immutableAccessEventSchema?.requiredFields) === stableJson(ACCESS_EVENT_FIELDS), "access event fields changed");
  assert(stableJson(p.accessControl?.immutableAccessEventSchema?.constraints) === stableJson(ACCESS_EVENT_CONSTRAINTS), "access event constraints changed");
  assert(p.accessControl?.immutableAccessEventSchema?.timeOrder === "authorizedAtRfc3339 < openedAtRfc3339 <= closedAtRfc3339", "access time order weakened");
  assert(p.accessControl?.immutableAccessEventSchema?.denyHasOpenReceipt === false, "DENY open receipt allowed");
  assert(p.accessControl?.immutableAccessEventSchema?.retroactiveEventsAllowed === false, "retroactive access event allowed");
  assert(stableJson(p.accessControl?.denySets) === stableJson(DENY_SETS), "deny sets must exactly cover every phase");
  assert(Object.keys(p.accessControl.denySets).length === PHASES.length, "one deny set required per state");
  for (const state of PHASES) assert(Array.isArray(p.accessControl.denySets[state]) && p.accessControl.denySets[state].length > 0, `empty deny set: ${state}`);
  assert(p.accessControl?.requiredPhaseSeals?.includes("S1_BLIND_PACKET_SHA256_BEFORE_ANY_RESULT_ACCESS"), "S1 pre-result packet seal missing");

  assert(p.s1EvaluationGate?.minimumCellN === 6, "S1 cell n changed");
  assert(p.s1EvaluationGate?.eligibleAssignments === 0, "S1 execution escalated");
  assert(p.s1EvaluationGate?.s1BlindPacketMustSealBeforeAnyResultAccess === true, "S1 packet gate missing");
  assert(stableJson(p.s1EvaluationGate?.phase1VisibleSurface?.allowOnly) === stableJson(S1_PHASE1_ALLOWED_FIELDS), "S1 phase-1 allowlist changed");
  assert(stableJson(p.s1EvaluationGate?.phase1VisibleSurface?.hiddenClasses) === stableJson(S1_PHASE1_HIDDEN_CLASSES), "S1 phase-1 hidden classes changed");
  assert(p.s1EvaluationGate?.phase1VisibleSurface?.studentVisibleOnly === true, "nonstudent phase-1 surface allowed");
  assert(p.s1EvaluationGate?.phase1VisibleSurface?.blindedIdentityOrderAndRelabelOnly === true, "unblinded phase-1 identity allowed");
  assert(p.s1EvaluationGate?.hiddenCommitment?.separateFromPhase1VisibleSurface === true, "hidden commitment merged into visible surface");
  assert(p.s1EvaluationGate?.hiddenCommitment?.sealedBeforePacketIssue === true, "hidden commitment not presealed");
  assert(p.s1EvaluationGate?.hiddenCommitment?.commitmentContentVisibleInPhase1 === false, "hidden commitment leaked in phase 1");
  assert(p.s1EvaluationGate?.hiddenCommitment?.revealRequiresOwnPhase1ResponseSealAndBoundAllowReceipt === true, "hidden reveal gate weakened");
  for (const forbidden of ["ARM_RANKING", "PROFILE_WINNER_SELECTION", "SUPERIORITY_OR_NONINFERIORITY_CLAIM", "RELEASE_OR_MODEL_QUALITY_CLAIM"]) {
    assert(p.s1EvaluationGate?.forbiddenAtN6?.includes(forbidden), `S1 forbidden claim missing: ${forbidden}`);
  }
  for (const flag of Object.values(p.s1EvaluationGate?.preAuthorityClaims ?? {})) assert(flag === false, "pre-authority score/selection/release claim");
  assert(Object.values(p.claims ?? {}).every((claim) => claim === true || claim === "NONE"), "authority-bearing claim detected");

  const legacyAllowedPrefix = "/supersession";
  walk(p, "", (node, pointer) => {
    if (pointer.startsWith(legacyAllowedPrefix)) return;
    if (node && typeof node === "object" && !Array.isArray(node)) {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        assert(!["pointFamily", "primaryIntentAxis", "divergentAxes"].includes(key), `legacy singleton field leaked at ${pointer}/${key}`);
      }
    }
    if (typeof node === "string") {
      assert(!/\b998\s*\+\s*2\b/i.test(node), `legacy allocation leaked at ${pointer}`);
    }
  });

  if (p.accessControl.currentState !== "PRE_ACCESS_UNAUTHORIZED") {
    assert(p.accessControl.observedAccessEvents.length > 0, "missing access evidence for advanced state");
    assert(p.accessControl.observedPhaseSeals.length > 0, "missing phase seals for advanced state");
  }

  if (requireCanonical) assert(stableJson(p) === stableJson(buildProtocol()), "protocol differs from canonical design");
}

export function buildProtocolMarkdown(): string {
  return `# Evaluation authority v2 protocol

Status: **DESIGN_ONLY_EXECUTION_BLOCKED**. Evaluator authority is false, scoring authority is false, authorized reviewers are 0, and authorized adjudicators are 0.

## Authority boundary

This package binds only the exact public bytes listed in \`protocol.json\`. It grants no provider call, result access, score, profile selection, or release authority. It never reads a \`private/\` path, trusted/pending gold, answers, reveals, environment files, a database, network, model/API, or budget ledger.

The old blind-adjudication-power-v1 **998 scheduled + 2 connectivity** allocation is superseded by the exact global registry: C0=2, S1=180, S2=480, S3=92, S4=144, S5=102. Its singleton \`pointFamily\`, \`primaryIntentAxis\`, and \`divergentAxes\` semantics are also superseded. Grammar uses sealed accepted family/correction sets; blank uses all seven proposition axes with one or two decisive axes. The predecessor grants no scoring authority.

## Required order

1. Start at \`PRE_ACCESS_UNAUTHORIZED\`.
2. Run a fresh 12-item taxonomy pilot and seal packet, responses, access events, and decision.
3. Run a fresh disjoint 24-item main certification and seal every blind/reveal phase.
4. Obtain a fresh independent trusted-gold audit pass and seal its access events and report.
5. Run a fresh disjoint one-time 24-item activation holdout.
6. Bind two distinct current reviewer certificates and one fresh incompatible-role adjudicator in a separate independently audited activation artifact.

Every state has a nonempty phase-appropriate deny set. Every allowed and denied access is append-only, ordinally chained, and SHA-256 sealed. An open requires a prior ALLOW authorization and capability token; its receipt binds the authorization, actor, role, phase, resource, visible surface, and capability with \`authorizedAt < openedAt <= closedAt\`. A DENY has no open receipt. Retroactive insertion, skips, reordering, post-open threshold changes, retroactive passes, and failed-item replay are forbidden.

The trusted-gold auditor is incompatible with the taxonomy-pilot, main-certification, and activation-holdout rater roles, as well as packet authoring and S1 review/adjudication. This preserves audit independence and holdout blindness.

## S1 boundary

The exact current S1 plan has 180 assignments: grammar 96 and blank 84, Standard 96 and Premium 84, Intermediate 90 and Killer 90. A cell size of six is only a mechanism, binding, deterministic-safety, yield, cost-envelope, and new-fatal-family screen. It cannot rank arms, select a winner, support superiority/noninferiority, or support release.

The complete S1 blind packet and a separate hidden commitment must be sealed before any result is accessed. Phase 1 exposes only the student-visible question surface plus blinded ID, order, and relabel surface. It hides plan; model/provider/route; profile/prompt arm; cost/token/usage; stored answer/key; explanation, key points, and wrong-option explanations; author target/grade; and generation metadata. The hidden commitment binds those fields but its content is not phase-1 visible. Until evaluator authority, two reviewer certificates, one fresh adjudicator, the S1 packet seal, and immutable per-access allow events all pass, item/aggregate scores, profile selection, and release claims are forbidden.

## Current disposition

This immutable design snapshot remains pre-access with zero access events, zero phase seals, zero authorized people, and zero eligible S1 assignments. Execution evidence must live in a new artifact; this package is never edited into an authorization.
`;
}

export async function buildPublicManifest(repoRoot: string, packageDir: string) {
  const upstreams = [];
  for (const row of UPSTREAMS) {
    const absolute = path.join(repoRoot, row.path);
    upstreams.push({ ...row, observedSha256: await sha256File(absolute) });
  }
  const packageFiles = [];
  for (const name of PACKAGE_FILES) {
    const absolute = path.join(packageDir, name);
    const bytes = await readFile(absolute);
    packageFiles.push({ path: name, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  }
  return {
    schemaVersion: "evaluation-authority-v2-public-manifest",
    artifactId: "evaluation-authority-v2",
    status: "DESIGN_ONLY_EXECUTION_BLOCKED",
    publicOnly: true,
    forbiddenPathComponents: ["private"],
    upstreams,
    packageFiles,
    authority: {
      evaluatorAuthorityGranted: false,
      scoringAuthorityGranted: false,
      authorizedReviewers: 0,
      authorizedAdjudicators: 0,
    },
    activity: {
      privateReads: 0,
      goldReads: 0,
      revealReads: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
      ledgerReadsOrWrites: 0,
    },
  } as const;
}

export async function buildManifestText(packageDir: string): Promise<string> {
  const lines: string[] = [];
  for (const name of MANIFEST_FILES) lines.push(`${await sha256File(path.join(packageDir, name))}  ${name}`);
  return `${lines.join("\n")}\n`;
}
