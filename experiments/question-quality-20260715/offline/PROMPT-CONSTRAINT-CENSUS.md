# Production prompt constraint census (zero-call)

Date: 2026-07-15 KST  
Scope: active 25 English types, default KILLER settings, one fixed 697-character passage  
External API/DB/browser calls: **0**

## What was measured

`prompt-constraint-census.ts` invokes the production prompt builder, type prompt, type-quality rubric, candidate block, and AI response schema for STANDARD and PREMIUM. It records characters, directive lexemes, schema size, and cross-layer near-duplicate lines.

This is a **lower bound**, not a token count: live diversity history, teacher instructions, saved analysis, target points, and private final checklists are omitted. Character count is not a quality score and does not by itself prove that a shorter prompt is better.

## Main results

| Plan | Minimum | Median | Maximum |
|---|---:|---:|---:|
| STANDARD | 35,341 chars | 39,375 chars | 61,784 chars |
| PREMIUM | 6,751 chars | 10,786 chars | 54,568 chars |

Largest PREMIUM lower-bound surfaces:

| Type | PREMIUM chars | STANDARD chars | Schema | Directive lexemes |
|---|---:|---:|---:|---:|
| `GRAMMAR_ERROR` | 54,568 | 61,784 | 4,672 | 89 |
| `GRAMMAR_CORRECTION` | 28,254 | 56,843 | 2,191 | 41 |
| `GRAMMAR_CHOICE_COMBO` | 19,775 | 48,364 | 2,942 | 21 |
| `IRRELEVANT` | 18,601 | 47,190 | 1,936 | 38 |
| `SUMMARY_WRITING` | 18,082 | 46,671 | 3,475 | 32 |
| `BLANK_INFERENCE` | 17,087 | 45,676 | 2,403 | 12 |

`GRAMMAR_ERROR` PREMIUM is 5.06 times the 25-type PREMIUM median. Its 30,093-character target-candidate block is 55.2% of the lower-bound surface and its 13,986-character type prompt is another 25.6%. The private final checklist is not yet included.

## Structural explanation

`buildQuestionGenerationPromptContract("STANDARD", typeId)` has a type-filtered section only for `GRAMMAR_ERROR`. The other active types fall back to `CONTRACT_TYPE_FULL_TAIL`, which concatenates instructions for blank, order, insertion, summaries, grammar, vocabulary, irrelevant-sentence, and other unrelated types.

This explains much of the STANDARD/PREMIUM gap for non-grammar types. For example, the fixed blank passage produced a 45,676-character STANDARD lower bound versus 17,087 PREMIUM. It does **not** establish the causal quality effect: irrelevant rules may be ignored, may distract the model, may accidentally help through generic constraints, or may interact with schema/model/plan.

An opt-in, production-default-preserving counterfactual was added for the two focus types. `GRAMMAR_ERROR` is already type-scoped, so its 61,784-character STANDARD surface did not change. `BLANK_INFERENCE` fell from 45,676 to 29,141 characters, a 36.2% reduction, solely by removing unrelated type segments. The default legacy call remains byte-identical and the unknown-type research mode fails closed.

The rerun also incorporates a production correctness fix: the shared marking rubric previously required every `surroundingText` to be exactly 40–80 characters while the `GRAMMAR_ERROR` schema permits 40–120 and KILLER long-distance dependencies may require more than 80. The common instruction now defers to the type schema and explicitly preserves the full grammar dependency. This changes prompt character counts but is not an experimental prompt-density treatment.

## Experiment implication

The A2 screen should include separate, hashed prompt profiles rather than a binary “more constraints/less constraints” claim:

1. legacy full-tail/current;
2. type-scoped tail with all type-relevant segments retained;
3. compressed positive design certificate;
4. explicit site/slot and option-intent artifact with redundant prose removed.

The comparison must keep passage, model, plan, schema, temperature/provider settings, and candidate budget fixed. Prompt length and cost are mediators; validity, ship-ready yield, beautiful-KILLER, and cost per ship-ready remain outcomes. A short prompt cannot win merely for being short.

## Reproducibility

- Result: `offline/out/prompt-constraint-census.json`
- Result SHA-256: `a5c9ca9d8f2d68bf5afcab97cfad042099e3a2644e3d692d78890e80ef356831`
- Script: `offline/prompt-constraint-census.ts`
- Script SHA-256: `ad7ef331d7a619a4911ad748371c86e553fd7a89f4f431dbaccff2221fb87f13`
- Running the script twice produced byte-identical result hashes.
- The result embeds hashes of the production source files and representative passage used, including the direct prompt-contract and shared marking-rubric sources.
